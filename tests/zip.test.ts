import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { unzipSync } from 'fflate';
import { createArchive } from '../src/files/zip.js';
import type { FilingFile } from '../src/domain.js';
async function fixture(run: (dir: string, file: FilingFile) => Promise<void>) {
 const dir = await mkdtemp(join(tmpdir(), 'filingfetch-zip-'));
 const bytes = Buffer.from('Synthetic accepted filing');
 const file: FilingFile = { path: join(dir,'source.txt'), filename: 'accepted.txt', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), mimeType:'text/plain', validation:'text', documentId:'1', documentTitle:'Synthetic', originalFilename:'accepted.txt', downloadedAt:'2026-11-06T00:00:00Z', cacheHit:false };
 try { await writeFile(file.path,bytes); await run(dir,file); } finally { await rm(dir,{recursive:true,force:true}); }
}
test('archive includes exactly accepted names and bytes', async () => {
 await fixture(async (dir,file) => {
  await writeFile(join(dir,'rejected.txt'),'Rejected');
  const output = join(dir,'result.zip');
  await createArchive([file],output,10000);
  const entries = unzipSync(await readFile(output));
  assert.deepEqual(Object.keys(entries).sort(),['accepted.txt']);
  assert.deepEqual(Buffer.from(entries['accepted.txt']!),await readFile(file.path));
 });
});
test('packaging rejects changed metadata, changed bytes, unsafe and duplicate names without output', async () => {
 await fixture(async (dir,file) => {
  const output = join(dir,'result.zip');
  for (const files of [[{...file,size:0}],[{...file,sha256:'0'.repeat(64)}],[{...file,filename:'../escape.txt'}],[file,file],[{...file,filename:'__proto__'}],[]]) {
   await assert.rejects(createArchive(files,output,10000));
   await assert.rejects(access(output));
  }
 });
});
test('raw and compressed budgets are enforced, and existing output is preserved', async () => {
 await fixture(async (dir,file) => {
  const output = join(dir,'result.zip');
  for (const max of [0,-1,NaN,Infinity,1.5,file.size-1]) await assert.rejects(createArchive([file],output,max));
  const bytes = randomBytes(64); await writeFile(file.path,bytes);
  const random = {...file,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  await assert.rejects(createArchive([random],output,bytes.length),/ZIP exceeds/);
  await assert.rejects(access(output));
  await writeFile(output,'existing');
  await assert.rejects(createArchive([random],output,10000));
  assert.equal(await readFile(output,'utf8'),'existing');
 });
});
