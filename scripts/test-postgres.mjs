/** Disposable real PostgreSQL integration. No remote credentials or production data. */
import EmbeddedPostgres from 'embedded-postgres';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';

if(process.getuid?.()===0) {
  console.error('Native PostgreSQL requires a non-root OS user. Use npm run test:sql here; run test:postgres in non-root CI.');process.exitCode=1;
} else {
  const dir=await mkdtemp(join(tmpdir(),'somas-postgres-'));
  const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));
  const port=listener.address().port;await new Promise(r=>listener.close(r));
  const password=randomBytes(18).toString('hex');
  const pg=new EmbeddedPostgres({databaseDir:join(dir,'data'),user:'postgres',password,port,persistent:false,
    postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
  try {
    await pg.initialise();await pg.start();
    const child=spawn(process.execPath,['--test','tests/postgres.test.js','tests/mission-postgres.test.js','tests/runtime-postgres.test.js'],{
      stdio:'inherit',env:{...process.env,SOMAS_TEST_DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:${port}/postgres`}});
    const code=await new Promise(r=>child.on('exit',r));process.exitCode=code??1;
  } finally {await pg.stop();await rm(dir,{recursive:true,force:true});}
}
