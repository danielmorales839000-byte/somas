import {neonDatabase} from './neon-database.mjs';

// Internet clients must never be able to supply ChatGPT's trusted identity.
// The application reconstructs it only after validating its own session cookie.
export function independentRequest(request) {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.toLowerCase().startsWith('oai-')) headers.delete(name);
  return new Request(request, {headers});
}

export async function independentEnvironment(env) {
  return {...env, DB: await neonDatabase(env.DATABASE_URL), AUTH_MODE: 'password', INDEPENDENT_HOSTING: 'true'};
}
