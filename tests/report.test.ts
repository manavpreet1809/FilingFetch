import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DOCUMENT_TYPES, type FetchResult } from '../src/domain.js';
import { createRetrievalReport, writeRetrievalReport } from '../src/report.js';
function result(): FetchResult {
 return { request:{matterNumber:'M12205',documentType:'Exhibits',limit:2}, matter:{number:'M12205',title:'Synthetic matter',status:null,type:null,category:null,receivedDate:null,finalSubmissionDate:null,outcome:null,counts:Object.fromEntries(DOCUMENT_TYPES.map(type => [type,type === 'Exhibits' ? 1 : 0])) as FetchResult['matter']['counts'],totalDocuments:1,retrievedAt:'2026-11-06T00:00:00Z',sourceUrl:'https://example.invalid/synthetic'}, files:[{path:'/private/synthetic.txt',filename:'synthetic.txt',size:3,sha256:'a'.repeat(64),mimeType:'text/plain',validation:'text',documentId:'1',documentTitle:'Synthetic filing',originalFilename:'original.txt',downloadedAt:'2026-11-06T00:00:00Z',cacheHit:true}],skipped:[],warnings:[],listingExhausted:true };
}
test('successful report round-trips metadata, hashes and summary without local paths or overwrite', async () => {
 const dir = await mkdtemp(join(tmpdir(),'filingfetch-report-'));
 try {
  const input = result(); const path = join(dir,'report.json');
  await writeRetrievalReport(input,join(dir,'filings.zip'),path);
  const report = JSON.parse(await readFile(path,'utf8'));
  assert.deepEqual(report,createRetrievalReport(input,join(dir,'filings.zip')));
  assert.deepEqual(report.matter,input.matter); assert.equal(report.files[0].sha256,input.files[0]!.sha256);
  assert.equal(report.files[0].originalFilename,'original.txt'); assert.equal('path' in report.files[0],false);
  assert.deepEqual(report.summary,{selectedCategoryDocuments:1,acceptedFiles:1,acceptedBytes:3,cacheHits:1,skippedEntries:0,warningCount:0});
  await assert.rejects(writeRetrievalReport(input,null,path));
  assert.equal(JSON.parse(await readFile(path,'utf8')).archive,'filings.zip');
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test('empty, rejected and incomplete reports preserve their distinct evidence', () => {
 const empty = result(); empty.files=[]; empty.matter.counts.Exhibits=0; empty.matter.totalDocuments=0;
 const report = createRetrievalReport(empty,null);
 assert.equal(report.archive,null); assert.equal(report.summary.acceptedFiles,0); assert.equal(report.listingExhausted,true);
 const incomplete = result(); incomplete.files=[]; incomplete.listingExhausted=false;
 incomplete.skipped=[{documentId:'1',filename:'synthetic.txt',reason:'Invalid file'}];
 incomplete.warnings=['Synthetic incomplete listing'];
 const partial = createRetrievalReport(incomplete,null);
 assert.deepEqual(partial.skipped,incomplete.skipped); assert.deepEqual(partial.warnings,incomplete.warnings);
 assert.equal(partial.summary.selectedCategoryDocuments,1); assert.equal(partial.summary.skippedEntries,1); assert.equal(partial.summary.warningCount,1);
 assert.equal(partial.listingExhausted,false);
});
