import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
async function check(dir){for(const item of await readdir(dir,{withFileTypes:true})){const file=dir+'/'+item.name;if(item.isDirectory()){if(!['dataset','vendor'].includes(item.name))await check(file);}else if(/\.(js|mjs)$/.test(item.name))execFileSync(process.execPath,['--check',file],{stdio:'inherit'});}}
for(const dir of ['src','public/exhibition','scripts'])await check(dir);
