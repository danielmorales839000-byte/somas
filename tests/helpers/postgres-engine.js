/** Actual PostgreSQL SQL execution in WASM; transport adapted to Neon's HTTP protocol.
 * Isolated test/staging data only. No hosted Neon credentials or production data.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export async function postgresEngine(dataDir) {
  const db = new PGlite(dataDir);
  await db.waitReady;
  for (const f of ["004_public_submissions.sql", "005_community.sql"])
    await db.exec(
      await readFile(new URL("../../db/" + f, import.meta.url), "utf8"),
    );
  let queue = Promise.resolve();
  const errors = [];
  const fetch = (_url, options) => {
    const run = async () => {
      const body = JSON.parse(options.body);
      const execute = async ({ query, params }, executor = db) => {
        const r = await executor.query(query, params, {
          serializers: {
            16: (v) => (v === true || v === "true" || v === "t" ? "t" : "f"),
          },
        });
        return {
          fields: r.fields.map((f) => ({
            name: f.name,
            dataTypeID: f.dataTypeID,
          })),
          rows: r.rows.map((row) =>
            r.fields.map((f) => {
              const v = row[f.name];
              return v === null
                ? null
                : v instanceof Date
                  ? v.toISOString().replace("T", " ").replace("Z", "+00")
                  : typeof v === "boolean"
                    ? v
                      ? "t"
                      : "f"
                    : typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v);
            }),
          ),
          rowCount: r.affectedRows ?? r.rows.length,
        };
      };
      try {
        if (body.queries) {
          const result = await db.transaction(async (tx) => {
            const results = [];
            for (const q of body.queries) results.push(await execute(q, tx));
            return results;
          });
          return Response.json({ results: result });
        }
        return Response.json(await execute(body));
      } catch (e) {
        errors.push({ code: e.code, message: e.message });
        return Response.json(
          { message: "isolated PostgreSQL error", code: e.code },
          { status: 400 },
        );
      }
    };
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  };
  return { db, fetch, errors, close: () => db.close() };
}
