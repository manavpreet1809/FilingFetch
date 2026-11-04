import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { safeFilename, validateFile } from '../src/files/validate.js';
import { publishUniqueFile } from '../src/files/names.js';
import { saveBoundedDownload } from '../src/uarb/download-stream.js';
import { DocumentCache } from '../src/cache/documents.js';
import { readConfig } from '../src/config.js';
async function fixture(run: (directory: string) => Promise<void>) {
 const dir = await mkdtemp(join(tmpdir(),'filingfetch-names-'));
 try { await run(dir); } finally { await rm(dir,{recursive:true,force:true}); }
}
test('unsafe, Unicode, reserved and long names remain portable basenames', () => {
 for (const input of ['../../escape.pdf','..\\..\\escape.pdf','/absolute/name.pdf','．．／escape.pdf','CON.txt','nul','..','', 'a'.repeat(300)+'.pdf','a?b.txt','a*b.txt']) {
  const name = safeFilename(input); assert.match(name,/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/);
  assert.ok(name.length <= 160); assert.equal(safeFilename(name),name);
  assert.doesNotMatch(name,/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i);
 }
});
test('distinct normalized collisions preserve bytes and file extensions', async () => {
 await fixture(async dir => {
  const a = join(dir,'first.part'), b = join(dir,'second.part'); await writeFile(a,'first'); await writeFile(b,'second');
  const first = await publishUniqueFile(a,dir,'a?b.txt'); const second = await publishUniqueFile(b,dir,'a*b.txt');
  assert.notEqual(first.filename,second.filename); assert.equal(second.filename,'a_b-1.txt');
  assert.equal(await readFile(first.path,'utf8'),'first'); assert.equal(await readFile(second.path,'utf8'),'second');
  assert.equal(dirname(first.path),resolve(dir)); assert.equal(dirname(second.path),resolve(dir));
 });
});
test('concurrent publication cannot replace another writer or exceed the name limit', async () => {
 await fixture(async dir => {
  const temps = await Promise.all(Array.from({length:12},async (_,i) => { const path=join(dir,`${i}.part`); await writeFile(path,`bytes-${i}`); return path; }));
  const results=await Promise.all(temps.map(path => publishUniqueFile(path,dir,'a'.repeat(300)+'.pdf')));
  assert.equal(new Set(results.map(r=>r.filename)).size,12);
  for (const [i,result] of results.entries()) { assert.ok(result.filename.length<=160); assert.ok(result.filename.endsWith('.pdf')); assert.equal(await readFile(result.path,'utf8'),`bytes-${i}`); }
 });
});
test('existing symlinks are not followed and temporary files must stay in the output directory', async () => {
 await fixture(async dir => {
  const out=join(dir,'out'); await mkdir(out); const outside=join(dir,'outside.txt'); await writeFile(outside,'protected');
  await symlink(outside,join(out,'name.txt')); const temp=join(out,'source.part'); await writeFile(temp,'new');
  const result=await publishUniqueFile(temp,out,'../../name.txt'); assert.equal(result.filename,'name-1.txt');
  assert.equal(await readFile(outside,'utf8'),'protected'); assert.equal(await readFile(result.path,'utf8'),'new');
  await assert.rejects(publishUniqueFile(outside,out,'escape.txt'),/outside the output/);
  await assert.rejects(publishUniqueFile(join(out,'name.txt'),out,'link.txt'),/not a regular/);
 });
});
test('streamed downloads return distinct published names and preserve existing output', async () => {
 await fixture(async dir => {
  const url='https://uarb.novascotia.ca/fmi/webd/APP/connector/synthetic'; const path=join(dir,'filing.txt'); await writeFile(path,'existing');
  const fetcher=(body:string):typeof fetch => async () => { const response=new Response(body); Object.defineProperty(response,'url',{value:url}); return response; };
  const results=await Promise.all(['first','second'].map(body=>saveBoundedDownload({url,path,cookie:'',maxBytes:100,timeoutMs:1000,fetcher:fetcher(body)})));
  assert.notEqual(results[0]!.filename,results[1]!.filename); assert.equal(await readFile(path,'utf8'),'existing');
  assert.equal(await readFile(results[0]!.path,'utf8'),'first'); assert.equal(await readFile(results[1]!.path,'utf8'),'second');
 });
});
test('cache restoration uses collision-safe names instead of overwriting local files', async () => {
 await fixture(async dir => {
  const source=join(dir,'source.txt'); await writeFile(source,'cached bytes');
  const config=readConfig({CACHE_BACKEND:'local',CACHE_DIRECTORY:join(dir,'cache')}); const cache=new DocumentCache(config);
  const request={matterNumber:'M12205',documentType:'Other Documents',limit:1} as const;
  const doc={id:'synthetic',title:'Synthetic',date:'',extension:'txt',security:'Public'};
  const validated=await validateFile(source,'filing.txt',1000);
  await cache.put(request,doc,[{...validated,documentId:doc.id,documentTitle:doc.title,originalFilename:'filing.txt',downloadedAt:new Date().toISOString(),cacheHit:false}]);
  const out=join(dir,'out'); await mkdir(out); await writeFile(join(out,'filing.txt'),'existing');
  const first=(await cache.get(request,doc,out,1))![0]!; const second=(await cache.get(request,doc,out,1))![0]!;
  assert.notEqual(first.filename,second.filename); assert.equal(first.cacheHit,true);
  assert.equal(await readFile(join(out,'filing.txt'),'utf8'),'existing');
  assert.equal(await readFile(first.path,'utf8'),'cached bytes'); assert.equal(await readFile(second.path,'utf8'),'cached bytes');
 });
});
