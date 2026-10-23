// Keep the application's prepared-query interface while using PostgreSQL over
// HTTPS. Values are always separate parameters, never interpolated into SQL.
export function postgresSQL(source) {
  const ignore = /^\s*INSERT OR IGNORE\b/i.test(source);
  let sql = source.replace(/^\s*INSERT OR IGNORE\b/i, 'INSERT');
  let quoted = '', result = '', parameter = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quoted) {
      result += c;
      if (c === quoted) {
        if (sql[i + 1] === quoted) result += sql[++i];
        else quoted = '';
      }
    } else if (c === "'" || c === '"') { quoted = c; result += c; }
    else result += c === '?' ? '$' + (++parameter) : c;
  }
  if (ignore) result = result.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  if (/\bchanges\(\)/i.test(result)) throw new Error('SQLite changes() requires an explicit PostgreSQL transaction.');
  return result;
}

function resultFor(result) {
  const fields = result.fields || [];
  const rows = (result.rows || []).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const type = fields.find(f => f.name === key)?.dataTypeID;
    if (value !== null && [20, 21, 23].includes(type)) {
      const n = Number(value);
      if (!Number.isSafeInteger(n)) throw new Error('Database integer exceeds the supported range.');
      value = n;
    }
    return [key, value];
  })));
  return {results: rows, meta: {changes: result.rowCount ?? result.affectedRows ?? rows.length}, success: true};
}

// The injected client is also used by the PostgreSQL integration tests.
export function postgresDatabase(client) {
  const database = {
    dialect: 'postgres',
    prepare(source) {
      const query = postgresSQL(source);
      function statement(values = []) {
        return {
          query, values,
          bind(...next) { return statement(next); },
          async first(column) { const row = resultFor(await client.query(query, values, {fullResults: true})).results[0]; return column ? row?.[column] ?? null : row ?? null; },
          async all() { return resultFor(await client.query(query, values, {fullResults: true})); },
          async run() { return this.all(); },
        };
      }
      return statement();
    },
    async batch(statements) {
      return (await client.transaction(statements.map(s => client.query(s.query, s.values)), {fullResults: true})).map(resultFor);
    },
  };
  return database;
}

export async function neonDatabase(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const {neon} = await import('@neondatabase/serverless');
  return postgresDatabase(neon(connectionString, {fullResults: true}));
}
