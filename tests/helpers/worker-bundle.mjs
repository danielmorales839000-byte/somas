import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.resolve('vite'));
export async function workerBundle(path){
 const {rolldown}=await import(require.resolve('rolldown'));
 const bundle=await rolldown({input:path,external:['cloudflare:workers']});
 try{const result=await bundle.generate({format:'esm'});return result.output[0].code}finally{await bundle.close()}
}
