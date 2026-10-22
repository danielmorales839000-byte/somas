import {spawn} from 'node:child_process';
console.log('SQL engine: PostgreSQL/WASM (PGlite). Serialized transactions; not a native concurrency or hosted Neon verification.');
const child=spawn(process.execPath,['--test','tests/mission-postgres.test.js','tests/runtime-postgres.test.js'],{stdio:'inherit',env:{...process.env,SOMAS_TEST_DATABASE_URL:'wasm'}});
child.on('exit',code=>process.exit(code??1));
