import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

// Disposable PostgreSQL only. A unique schema isolates this additive migration.
test(
  "public inquiry migration is repeatable and database constraints protect records",
  { skip: !process.env.SOMAS_TEST_DATABASE_URL },
  async (t) => {
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(process.env.SOMAS_TEST_DATABASE_URL).hostname,
      ),
      "Only disposable loopback PostgreSQL is allowed",
    );
    const client = new pg.Client({
      connectionString: process.env.SOMAS_TEST_DATABASE_URL,
    });
    await client.connect();
    const schema = "exhibition_" + crypto.randomUUID().replaceAll("-", "");
    t.after(async () => {
      await client.query("SET search_path TO public");
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await client.end();
    });
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    const migration = await readFile("db/004_public_submissions.sql", "utf8");
    await client.query(migration);
    await client.query(migration);
    const id = crypto.randomUUID();
    await client.query(
      "INSERT INTO public_submissions(id,kind,payload) VALUES($1,$2,$3)",
      [
        id,
        "contact",
        JSON.stringify({ name: "Test", email: "example@example.test" }),
      ],
    );
    await assert.rejects(
      client.query(
        "INSERT INTO public_submissions(id,kind,payload) VALUES($1,$2,$3)",
        [id, "contact", "{}"],
      ),
      /duplicate/,
    );
    await assert.rejects(
      client.query(
        "INSERT INTO public_submissions(id,kind,payload) VALUES($1,$2,$3)",
        [crypto.randomUUID(), "invalid", "{}"],
      ),
      /check constraint/,
    );
    const { rows } = await client.query(
      "SELECT grantee FROM information_schema.table_privileges WHERE table_schema=$1 AND table_name='public_submissions' AND grantee='PUBLIC'",
      [schema],
    );
    assert.equal(rows.length, 0);
    assert.equal(
      (await client.query("SELECT count(*)::int n FROM public_submissions"))
        .rows[0].n,
      1,
    );
  },
);
