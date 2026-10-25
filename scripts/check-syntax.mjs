import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
for (const dir of ["src", "public/exhibition", "scripts"])
  for (const file of await readdir(dir))
    if (/\.(js|mjs)$/.test(file))
      execFileSync(process.execPath, ["--check", dir + "/" + file], {
        stdio: "inherit",
      });
