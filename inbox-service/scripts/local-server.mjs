// Development only. This loopback server supplies a synthetic owner identity;
// it is never included in the hosted Worker artifact or used for production auth.
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await mkdir(path.join(root,'.local'),{recursive:true});
const sql=new DatabaseSync(path.join(root,'.local','inbox.sqlite'));
sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
if(!sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='threads'").get()){
  sql.exec(await readFile(path.join(root,'migrations','0001_inbox.sql'),'utf8'));
}
class Statement{
  constructor(query,args=[]){this.query=query;this.args=args;}
  bind(...args){return new Statement(this.query,args);}
  async first(column){const row=sql.prepare(this.query).get(...this.args);return row?(column?row[column]:row):null;}
  async all(){return{results:sql.prepare(this.query).all(...this.args),success:true};}
  async run(){const result=sql.prepare(this.query).run(...this.args);return{success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
}
const DB={prepare:query=>new Statement(query),async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const env={DB,ALLOWED_EMAILS:'owner@example.test',RATE_SECRET:'local-development-rate-key-not-for-production',PUBLIC_ORIGIN:'http://127.0.0.1:8792',LOCAL_PREVIEW:'1',RELEASE_SHA:'local-development'};
const worker=(await import(pathToFileURL(path.join(root,'dist/server/index.js')))).default;
createServer(async(req,res)=>{
  try{
    const headers=new Headers();
    for(const [key,value] of Object.entries(req.headers)){
      if(value && !key.startsWith('oai-') && key!=='host' && key!=='cf-connecting-ip') headers.set(key,Array.isArray(value)?value.join(','):value);
    }
    headers.set('CF-Connecting-IP','127.0.0.1');
    headers.set('oai-authenticated-user-id','local-synthetic-owner');
    headers.set('oai-authenticated-user-email','owner@example.test');
    headers.set('oai-authenticated-user-full-name','Raj (local test)');
    const init={method:req.method,headers};
    if(!['GET','HEAD'].includes(req.method)){init.body=Readable.toWeb(req);init.duplex='half';}
    const response=await worker.fetch(new Request(new URL(req.url,'http://127.0.0.1:8793'),init),env,{waitUntil(promise){promise.catch(()=>{});}});
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'Content-Type':'text/plain'}).end('Local test service failed.');}
}).listen(8793,'127.0.0.1',()=>console.log('Inbox development server: http://127.0.0.1:8793 (synthetic owner, local SQLite only)'));
