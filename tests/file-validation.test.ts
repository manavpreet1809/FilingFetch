import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { zipSync } from 'fflate';
import { validateFile } from '../src/files/validate.js';
import { FilingError } from '../src/domain.js';
async function fixture(bytes: Uint8Array | string, name: string, run: (path: string) => Promise<void>) {
 const dir = await mkdtemp(join(tmpdir(),'filingfetch-content-'));
 try { const path = join(dir,name); await writeFile(path,bytes); await run(path); }
 finally { await rm(dir,{recursive:true,force:true}); }
}
const invalid = (error: unknown) => error instanceof FilingError && ['INVALID_FILE','INVALID_PDF','FILE_SIZE'].includes(error.code);
test('valid synthetic PDF is parsed and hashes the actual source bytes', async () => {
 const pdf = await PDFDocument.create(); pdf.addPage(); const bytes = await pdf.save();
 await fixture(bytes,'synthetic.pdf',async path => {
  const result = await validateFile(path,'synthetic.pdf',bytes.length);
  assert.equal(result.validation,'pdf-parsed'); assert.equal(result.mimeType,'application/pdf');
  assert.equal(result.size,bytes.length); assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));
 });
 await fixture(bytes,'synthetic.txt',async path => { await assert.rejects(validateFile(path,'synthetic.txt',10000),invalid); });
});
test('valid UTF-8 text and CSV preserve their intended MIME types', async () => {
 for (const name of ['synthetic.txt','synthetic.csv']) await fixture('café,one\n1,2\n',name,async path => {
  const result = await validateFile(path,name,100); assert.equal(result.validation,'text');
  assert.equal(result.mimeType,name.endsWith('csv')?'text/csv':'text/plain');
 });
});
test('HTML responses are rejected including BOM, leading whitespace and comments', async () => {
 for (const body of ['<html>error</html>','  <!DOCTYPE html><html>error</html>','\uFEFF<!-- gateway -->\n<html>error</html>']) {
  for (const name of ['synthetic.pdf','synthetic.txt']) await fixture(body,name,async path => { await assert.rejects(validateFile(path,name,1000),invalid); });
 }
});
test('empty, oversized, corrupt, mismatched and binary-text files fail cleanly', async () => {
 const cases: [Uint8Array|string,string,number][] = [
  ['', 'empty.txt',100], ['too large','large.txt',1], ['not a PDF','fake.pdf',100],
  ['%PDF-1.7\ninvalid objects','broken.pdf',100], [Buffer.from([0x50,0x4b,3,4]),'truncated.zip',100],
  [Buffer.from([0xc3,0x28]),'bad.txt',100], [Buffer.from([0,1,2]),'binary.csv',100],
  [Buffer.from([1,2,3]),'controls.txt',100], ['ordinary text','unknown.exe',100]
 ];
 for (const [bytes,name,max] of cases) await fixture(bytes,name,async path => { await assert.rejects(validateFile(path,name,max),invalid,name); });
});

test('ZIP containers must be readable and remain within the expansion budget', async () => {
 const bytes = zipSync({ 'synthetic.txt': Buffer.from('Synthetic filing') });
 await fixture(bytes,'synthetic.zip',async path => { assert.equal((await validateFile(path,'synthetic.zip',1000)).mimeType,'application/zip'); });
 await fixture(bytes.subarray(0,bytes.length-8),'broken.zip',async path => { await assert.rejects(validateFile(path,'broken.zip',1000),invalid); });
 const bomb = zipSync({ 'synthetic.txt': Buffer.alloc(10000,65) });
 await fixture(bomb,'oversized.zip',async path => { await assert.rejects(validateFile(path,'oversized.zip',1000),invalid); });
});
