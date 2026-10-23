import vinext from "vinext";
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { sites } from "./scripts/vite/sites-vite-plugin";
import { connectorPreview } from "./scripts/vite/connector-preview-plugin.mjs";
import { buildTeamSource } from "./scripts/build-team-source.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const independent = process.env.SOMAS_DEPLOY_TARGET === 'cloudflare-neon';
// An independently deployed copy has no ChatGPT Sites project or D1 binding.
// Read the hosting manifest only for the original Sites build target.
const { d1, r2 } = independent
  ? { d1: null, r2: null }
  : JSON.parse(readFileSync(new URL('./.openai/hosting.json', import.meta.url), 'utf8'));

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  await buildTeamSource();
  configureToolEnvironment(process.cwd());

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {'process.env.NEXT_PUBLIC_SOMAS_INDEPENDENT': JSON.stringify(independent?'true':'false')},
    server: {
      ...(managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : {}),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      ...(!independent?[sites({ mockAuth: !managedLinux }),connectorPreview()]:[]),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          ...localBindingConfig,
          ...(independent?{
            name:'somas-cloudflare-neon',main:'./worker/independent.ts',d1_databases:[],r2_buckets:[],
            compatibility_date:'2026-05-15',workers_dev:true,
            triggers:{crons:['0 * * * *']},
            vars:{AUTH_MODE:'password',INDEPENDENT_HOSTING:'true',EMAIL_VERIFICATION_REQUIRED:'true',PRIVATE_RUNNER_ENABLED:'true'},
          }:{}),
          ...(command === "serve" && !independent
            ? {
                services: [
                  {
                    binding: "CONNECTORS",
                    service: "sites-connector-preview",
                    entrypoint: "ConnectorPreview",
                  },
                ],
              }
            : {}),
        },
        ...(command === "serve" && !independent
          ? {
              auxiliaryWorkers: [
                {
                  config: {
                    name: "sites-connector-preview",
                    main: "./scripts/connector-preview/worker.mjs",
                    compatibility_date: "2026-05-15",
                  },
                },
              ],
            }
          : {}),
      }),
    ],
  };
});
