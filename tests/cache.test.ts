import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DocumentCache } from '../src/cache/documents.js';
import { readConfig } from '../src/config.js';
import { validateFile } from '../src/files/validate.js';
const request = {matterNumber:'M12205',documentType:'Exhibits',limit:2} as const;
const doc = {id:'synthetic',title:'Synthetic',date:'',extension:'txt',security:'Public'};
async function fixture(run: (cache:DocumentCache, dir:string, out:string, manifest:string) => Promise<void>) {
 const dir=await mkdtemp(join(tmpdir(),'filingfetch-cache-')); const out=join(dir,'out'); await mkdir(out);
 try {
  const config=readConfig({CACHE_BACKEND:'local',CACHE_DIRECTORY:join(dir,'cache')}); const cache=new DocumentCache(config);
  const files=[];
  for(const name of ['one.txt','two.txt']) { const path=join(dir,name); await writeFile(path,`Synthetic ${name}`); files.push({...await validateFile(path,name,1000),documentId:doc.id,documentTitle:doc.title,originalFilename:name,downloadedAt:new Date().toISOString(),cacheHit:false}); }
  await cache.put(request,doc,files);
  const manifest=join(config.CACHE_DIRECTORY,'manifests',(await readdir(join(config.CACHE_DIRECTORY,'manifests')))[0]!);
  await run(cache,dir,out,manifest);
 } finally { await rm(dir,{recursive:true,force:true}); }
}
test('cache hits preserve evidence while TTL and source changes invalidate reuse',async()=>fixture(async(cache,dir,out,manifest)=>{
 const hit=await cache.get(request,doc,out,1); assert.equal(hit!.length,1); assert.equal(hit![0]!.cacheHit,true);
 assert.equal(await readFile(hit![0]!.path,'utf8'),'Synthetic one.txt');
 assert.equal(await cache.get(request,{...doc,title:'Changed'},out,2),null);
 const entry=JSON.parse(await readFile(manifest,'utf8')); entry.expiresAt='2000-01-01T00:00:00Z'; await writeFile(manifest,JSON.stringify(entry));
 assert.equal(await cache.get(request,doc,out,2),null);
}));
test('invalid expiry, unsafe manifest keys and mismatched document identity fail closed',async()=>fixture(async(cache,dir,out,manifest)=>{
 const original=JSON.parse(await readFile(manifest,'utf8'));
 for(const mutate of [(e:any)=>e.expiresAt='invalid',(e:any)=>e.files[0].key='../escape',(e:any)=>e.files[0].documentId='other',(e:any)=>e.files[0].size=-1]) {
  const entry=structuredClone(original); mutate(entry); await writeFile(manifest,JSON.stringify(entry));
  await assert.rejects(cache.get(request,doc,out,2)); assert.deepEqual(await readdir(out),[]);
 }
}));
test('corruption of a later cached file rolls back the entire restore and temporary files',async()=>fixture(async(cache,dir,out,manifest)=>{
 const entry=JSON.parse(await readFile(manifest,'utf8')); await writeFile(join(dir,'cache',entry.files[1].key),'Corrupt bytes');
 await assert.rejects(cache.get(request,doc,out,2),/integrity/); assert.deepEqual(await readdir(out),[]);
}));
test('missing objects and malformed JSON fail without restored artifacts',async()=>fixture(async(cache,dir,out,manifest)=>{
 const entry=JSON.parse(await readFile(manifest,'utf8')); await rm(join(dir,'cache',entry.files[0].key));
 await assert.rejects(cache.get(request,doc,out,2)); assert.deepEqual(await readdir(out),[]);
 await writeFile(manifest,'{'); await assert.rejects(cache.get(request,doc,out,2));
}));
