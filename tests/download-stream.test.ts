import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveBoundedDownload } from '../src/uarb/download-stream.js';
import { FilingError } from '../src/domain.js';
import { readConfig } from '../src/config.js';
const url = 'https://uarb.novascotia.ca/fmi/webd/APP/connector/synthetic';
function response(body: ReadableStream<Uint8Array> | string | null, headers: Record<string,string> = {}, status = 200) {
  const result = new Response(body, { headers, status });
  Object.defineProperty(result, 'url', { value: url }); return result;
}
const code = (expected: string) => (error: unknown) => error instanceof FilingError && error.code === expected;
async function fixture(run: (directory: string, path: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'filingfetch-download-'));
  try { await run(directory, join(directory, 'synthetic.txt')); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
const options = (path: string, fetcher: typeof fetch) => ({ url, path, cookie: '', maxBytes: 5, timeoutMs: 1000, fetcher });
test('a complete transfer at the exact byte limit is published without temporary files', async () => {
  await fixture(async (directory,path) => {
    await saveBoundedDownload(options(path, async () => response('abcde', { 'content-length':'5' })));
    assert.equal(await readFile(path,'utf8'), 'abcde'); assert.deepEqual(await readdir(directory), ['synthetic.txt']);
  });
});
test('oversized and malformed declared lengths cancel the response before publication', async () => {
  for (const length of ['6','-1','1.5','not-a-number','9007199254740992']) {
    await fixture(async (directory,path) => {
      let cancelled = false;
      const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
      await assert.rejects(saveBoundedDownload(options(path, async () => response(body, { 'content-length':length }))), code(length === '6' ? 'FILE_SIZE' : 'DOWNLOAD_FAILED'));
      assert.equal(cancelled,true); assert.deepEqual(await readdir(directory), []);
    });
  }
});
test('streamed byte caps apply when content length is missing or understated', async () => {
  for (const headers of [{}, { 'content-length':'1' }]) {
    await fixture(async (directory,path) => {
      const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(Buffer.from('abc')); c.enqueue(Buffer.from('def')); c.close(); } });
      await assert.rejects(saveBoundedDownload(options(path, async () => response(body,headers))), code('FILE_SIZE'));
      assert.deepEqual(await readdir(directory), []);
    });
  }
});
test('split WAV headers retain the existing declared-size cap', async () => {
  await fixture(async (directory,path) => {
    const header = Buffer.alloc(12); header.write('RIFF'); header.writeUInt32LE(1000,4); header.write('WAVE',8);
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(header.subarray(0,4)); c.enqueue(header.subarray(4,9)); c.enqueue(header.subarray(9)); c.close(); } });
    await assert.rejects(saveBoundedDownload({ ...options(path, async () => response(body)), maxBytes:100 }), code('FILE_SIZE'));
    assert.deepEqual(await readdir(directory), []);
  });
});
test('a stalled response body times out, cancels its stream and removes partial bytes', async () => {
  await fixture(async (directory,path) => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(Buffer.from('a')); }, cancel() { cancelled = true; } });
    await assert.rejects(saveBoundedDownload({ ...options(path, async () => response(body)), timeoutMs:30 }), code('DOWNLOAD_TIMEOUT'));
    assert.equal(cancelled,true); assert.deepEqual(await readdir(directory), []);
  });
});
test('the transfer deadline also bounds waiting for response headers', async () => {
  await fixture(async (directory,path) => {
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve,reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once:true });
    });
    await assert.rejects(saveBoundedDownload({ ...options(path,fetcher), timeoutMs:30 }), code('DOWNLOAD_TIMEOUT'));
    assert.deepEqual(await readdir(directory), []);
  });
});
test('job cancellation interrupts streaming and preserves a pre-existing complete file', async () => {
  await fixture(async (directory,path) => {
    await writeFile(path,'known-good'); const job = new AbortController(); let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(Buffer.from('a')); }, cancel() { cancelled = true; } });
    const timer = setTimeout(() => job.abort(new FilingError('JOB_TIMEOUT','Retrieval exceeded its time limit')),30);
    try {
      await assert.rejects(saveBoundedDownload({ ...options(path, async () => response(body)), signal:job.signal }), code('JOB_TIMEOUT'));
    } finally { clearTimeout(timer); }
    assert.equal(cancelled,true); assert.equal(await readFile(path,'utf8'),'known-good');
    assert.deepEqual(await readdir(directory), ['synthetic.txt']);
  });
});
test('aborted jobs make no request and interrupted responses leave no output', async () => {
  await fixture(async (directory,path) => {
    let requests = 0; const controller = new AbortController(); controller.abort();
    await assert.rejects(saveBoundedDownload({ ...options(path, async () => { requests++; return response('a'); }), signal:controller.signal }), code('DOWNLOAD_FAILED'));
    assert.equal(requests,0);
    const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(Buffer.from('a')); c.error(new Error('synthetic disconnect')); } });
    await assert.rejects(saveBoundedDownload(options(path, async () => response(body))), code('DOWNLOAD_FAILED'));
    assert.deepEqual(await readdir(directory), []);
  });
});
test('HTTP failures, absent bodies and filesystem failures do not publish output', async () => {
  await fixture(async (directory,path) => {
    for (const result of [response('not found',{},404), response(null,{},204)]) {
      await assert.rejects(saveBoundedDownload(options(path, async () => result)), code('DOWNLOAD_FAILED'));
    }
    await assert.rejects(saveBoundedDownload(options(join(directory,'missing','file'), async () => response('a'))), code('DOWNLOAD_FAILED'));
    assert.deepEqual(await readdir(directory), []);
  });
});
test('download timeout configuration cannot overflow the platform timer', () => {
  assert.throws(() => readConfig({ DOWNLOAD_TIMEOUT_MS:'2147483648' }), /DOWNLOAD_TIMEOUT_MS/);
});
