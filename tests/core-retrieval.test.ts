import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRetrievalReport } from '../src/report.js';
import { fetchDocuments } from '../src/fetch.js';
import { DocumentCache } from '../src/cache/documents.js';
import { readConfig } from '../src/config.js';
import { DOCUMENT_TYPES, FilingError, type Matter, type DocumentReference } from '../src/domain.js';
import { parseCounts, parseDate } from '../src/uarb/parse.js';

const request = { matterNumber: 'M12205', documentType: 'Other Documents', limit: 2 } as const;
const doc = (id: string, security = 'Public'): DocumentReference => ({ id, title: id, date: '', extension: 'txt', security });
function source(directory: string, pages: DocumentReference[][], overrides: Partial<Matter> = {}) {
  let page = 0;
  const downloads: string[] = [];
  let closed = false;
  const matter: Matter = { number: request.matterNumber, title: 'Fixture matter', status: null, type: null,
    category: null, receivedDate: null, finalSubmissionDate: null, outcome: null,
    counts: Object.fromEntries(DOCUMENT_TYPES.map(type => [type, type === request.documentType ? pages.flat().length : 0])) as Matter['counts'],
    totalDocuments: pages.flat().length, retrievedAt: new Date().toISOString(), sourceUrl: 'https://example.invalid', ...overrides };
  return { downloads, get closed() { return closed; },
    async open() { return matter; }, async visibleDocuments() { return pages[page] ?? []; },
    async nextPage() { return ++page < pages.length; }, async openAttachments() { return ['document.txt']; },
    async download(document: DocumentReference) { downloads.push(document.id); const filename = `${document.id}.txt`;
      const path = join(directory, filename); await writeFile(path, `Public filing ${document.id}`); return { path, filename }; },
    async closeAttachments() {}, async screenshot() {}, timedOut: false, async close() { closed = true; } };
}
async function fixture(run: (directory: string, config: ReturnType<typeof readConfig>) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'filingfetch-test-'));
  try { await run(directory, readConfig({ CACHE_BACKEND: 'off' })); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
test('retrieval crosses pages, skips restricted rows, deduplicates, and honors the limit', async () => {
  await fixture(async (directory, config) => {
    const fake = source(directory, [[doc('private', 'Restricted'), doc('one')], [doc('one'), doc('two'), doc('three')]]);
    const result = await fetchDocuments(request, config, directory, new DocumentCache(config), false, fake);
    assert.deepEqual(fake.downloads, ['one', 'two']);
    assert.deepEqual(result.files.map(file => file.documentId), ['one', 'two']);
    assert.equal(result.skipped[0]?.documentId, 'private');
    assert.equal(result.matter.title, 'Fixture matter');
    assert.equal(fake.closed, true);
  });
});
test('wrong matter fails before downloading and closes the source', async () => {
  await fixture(async (directory, config) => {
    const fake = source(directory, [[doc('one')]], { number: 'M99999' });
    await assert.rejects(fetchDocuments(request, config, directory, new DocumentCache(config), false, fake),
      (error: unknown) => error instanceof FilingError && error.code === 'WRONG_MATTER');
    assert.deepEqual(fake.downloads, []); assert.equal(fake.closed, true);
  });
});
test('empty category completes without opening attachments', async () => {
  await fixture(async (directory, config) => {
    const fake = source(directory, []);
    const result = await fetchDocuments(request, config, directory, new DocumentCache(config), false, fake);
    assert.equal(result.listingExhausted, true); assert.deepEqual(result.files, []); assert.equal(fake.closed, true);
  });
});
test('early listing termination is reported as incomplete', async () => {
  await fixture(async (directory, config) => {
    const counts = Object.fromEntries(DOCUMENT_TYPES.map(type => [type, type === request.documentType ? 5 : 0])) as Matter['counts'];
    const fake = source(directory, [[doc('one')]], { counts });
    const result = await fetchDocuments(request, config, directory, new DocumentCache(config), false, fake);
    assert.match(result.warnings.join(' '), /1 of 5/);
  });
});
test('all five category counts are required and comma-separated counts are parsed', () => {
  const labels = DOCUMENT_TYPES.map(type => `${type} - ${type === 'Exhibits' ? '1,234' : '0'}`);
  assert.equal(parseCounts(labels).Exhibits, 1234);
  assert.throws(() => parseCounts(labels.slice(1)), FilingError);
});
test('source dates reject invalid months, days, and formats with a domain error', () => {
  assert.equal(parseDate('02/29/2024'), '2024-02-29'); assert.equal(parseDate(''), null);
  for (const date of ['02/29/2023', '13/01/2024', '00/10/2024', '2024-01-01']) {
    assert.throws(() => parseDate(date), (error: unknown) => error instanceof FilingError && error.code === 'PAGE_CHANGED');
  }
});
test('invalid CLI requests exit cleanly before starting retrieval', () => {
  for (const args of [['M123', 'Exhibits'], ['M12205', 'Invalid'], ['M12205', 'Exhibits', '--limit', '0']]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1); assert.ok(result.stderr.length > 0);
    assert.doesNotMatch(result.stdout, /Retrieving/); assert.doesNotMatch(result.stderr, /at .*cli\.ts/);
  }
});

test('repeated source windows fail without redownloading or leaving the source open', async () => {
  await fixture(async (directory, config) => {
    const counts = Object.fromEntries(DOCUMENT_TYPES.map(type => [type, type === request.documentType ? 5 : 0])) as Matter['counts'];
    const fake = source(directory, [[doc('one')]], { counts });
    fake.nextPage = async () => true;
    await assert.rejects(fetchDocuments(request, config, directory, new DocumentCache(config), false, fake), /stopped making progress/);
    assert.deepEqual(fake.downloads, ['one']); assert.equal(fake.closed, true);
  });
});
test('three overlapping source windows exhaust exactly the advertised unique rows', async () => {
  await fixture(async (directory, config) => {
    const counts = Object.fromEntries(DOCUMENT_TYPES.map(type => [type, type === request.documentType ? 5 : 0])) as Matter['counts'];
    const fake = source(directory, [[doc('one'),doc('two')], [doc('two'),doc('three'),doc('four')], [doc('four'),doc('five')]], { counts });
    const result = await fetchDocuments({ ...request, limit: 10 }, config, directory, new DocumentCache(config), false, fake);
    assert.deepEqual(fake.downloads, ['one','two','three','four','five']);
    assert.equal(result.listingExhausted, true); assert.deepEqual(result.warnings, []); assert.equal(fake.closed, true);
  });
});

test('unverified and restricted rows are reported without cache or attachment access', async () => {
  await fixture(async (directory, config) => {
    const fake = source(directory, [[doc('restricted','Restricted'), doc('blank',''), doc('unknown','Unknown'), doc('allowed',' Public ')]]);
    const cache = new DocumentCache(config); let lookups = 0;
    cache.get = async () => { lookups++; return null; };
    let dialogs = 0; fake.openAttachments = async () => { dialogs++; return ['document.txt']; };
    const result = await fetchDocuments(request, config, directory, cache, false, fake);
    assert.deepEqual(fake.downloads, ['allowed']); assert.equal(lookups, 1); assert.equal(dialogs, 1);
    assert.deepEqual(result.skipped.map(row => row.documentId), ['restricted','blank','unknown']);
    assert.match(result.skipped[1]!.reason, /visibility is missing/);
    assert.equal(result.listingExhausted, true); assert.equal(fake.closed, true);
  });
});

test('changed attachment selection is not retried and its reason stays in the report', async () => {
  await fixture(async (directory, config) => {
    const fake = source(directory, [[doc('one')]]); let attempts = 0;
    fake.download = async () => { attempts++; throw new FilingError('PAGE_CHANGED', 'Attachment list changed while downloading'); };
    const result = await fetchDocuments(request, config, directory, new DocumentCache(config), false, fake);
    assert.equal(attempts, 1); assert.deepEqual(result.files, []);
    assert.match(result.skipped[0]!.reason, /Attachment list changed/); assert.equal(fake.closed, true);
  });
});


test('interrupted retrieval preserves accepted evidence and warning in the serialized report', async () => {
  await fixture(async (directory, config) => {
    const fake = source(directory, [[doc('one')], [doc('two')]]);
    fake.nextPage = async () => { fake.timedOut = true; throw new FilingError('JOB_TIMEOUT', 'Synthetic timeout'); };
    const result = await fetchDocuments(request, config, directory, new DocumentCache(config), false, fake);
    const report = createRetrievalReport(result, join(directory, 'partial.zip'));
    assert.equal(report.files.length, 1); assert.equal(report.files[0]!.documentId, 'one');
    assert.equal(report.listingExhausted, false); assert.match(report.warnings.join(' '), /time limit/);
    assert.equal(report.archive, 'partial.zip'); assert.equal(fake.closed, true);
    assert.equal(JSON.stringify(report).includes(directory), false);
  });
});

test('cache integrity errors fall back to source retrieval with a visible warning', async () => {
 await fixture(async (directory,config) => {
  const fake=source(directory,[[doc('one')]]); const cache=new DocumentCache(config);
  cache.get=async()=>{throw new Error('Synthetic integrity failure');};
  const result=await fetchDocuments(request,config,directory,cache,false,fake);
  assert.deepEqual(fake.downloads,['one']); assert.equal(result.files[0]!.cacheHit,false);
  assert.match(result.warnings.join(' '),/Cache read failed for one/); assert.equal(fake.closed,true);
 });
});
