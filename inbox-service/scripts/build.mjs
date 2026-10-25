import { mkdir,readFile,writeFile,copyFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
await mkdir(path.join(dist,'server'),{recursive:true});
await mkdir(path.join(dist,'.openai'),{recursive:true});
await mkdir(path.join(dist,'migrations'),{recursive:true});
await mkdir(path.join(root,'drizzle','meta'),{recursive:true});
const schema=await readFile(path.join(root,'migrations','0001_inbox.sql'),'utf8');
await writeFile(path.join(root,'drizzle','0000_inbox.sql'),schema);
await writeFile(path.join(root,'drizzle','meta','_journal.json'),JSON.stringify({version:'7',dialect:'sqlite',entries:[{idx:0,version:'6',when:1792792800000,tag:'0000_inbox',breakpoints:true}]},null,2)+'\n');
const assets={};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
for(const name of await readdir(path.join(root,'static'))){
  if(!types[path.extname(name)]) throw new Error('Unexpected static asset');
  assets['/'+name]={body:await readFile(path.join(root,'static',name),'utf8'),type:types[path.extname(name)]};
}
await writeFile(path.join(dist,'server','assets.mjs'),'export const assets = '+JSON.stringify(assets)+';\n');
for(const file of ['index.js','api.mjs']) await copyFile(path.join(root,'worker',file),path.join(dist,'server',file));
await writeFile(path.join(dist,'server','package.json'),'{"type":"module"}\n');
await copyFile(path.join(root,'.openai','hosting.json'),path.join(dist,'.openai','hosting.json'));
for(const file of await readdir(path.join(root,'migrations'))){
  if(!file.endsWith('.sql')) continue;
  await copyFile(path.join(root,'migrations',file),path.join(dist,'migrations',file));
}
await writeFile(path.join(dist,'server','wrangler.json'),JSON.stringify({name:'raj-industries-inbox',main:'index.js',compatibility_date:'2026-10-01',d1_databases:[{binding:'DB',database_name:'raj-industries-inbox',database_id:'00000000-0000-0000-0000-000000000000',migrations_dir:'../migrations'}]},null,2));
console.log('Built inbox Worker, embedded assets, and schema migrations. No runtime secrets included.');
