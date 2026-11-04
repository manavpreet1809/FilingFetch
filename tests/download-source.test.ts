import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadSourceUrl, fetchDownloadSource } from '../src/uarb/download-source.js';
import { FilingError } from '../src/domain.js';
const valid = 'https://uarb.novascotia.ca/fmi/webd/APP/connector/synthetic?id=1';
const invalid = ['', '/fmi/webd/APP/connector/file', 'http://uarb.novascotia.ca/fmi/webd/APP/connector/file',
  'https://uarb.novascotia.ca.evil.invalid/fmi/webd/APP/connector/file',
  'https://evil.invalid/fmi/webd/APP/connector/file', 'https://uarb.novascotia.ca:444/fmi/webd/APP/connector/file',
  'https://user:password@uarb.novascotia.ca/fmi/webd/APP/connector/file',
  'https://uarb.novascotia.ca/fmi/webd/APP/connector/', 'https://uarb.novascotia.ca/fmi/webd/APP/connector-other/file',
  'https://uarb.novascotia.ca/fmi/webd/APP/connector/../file',
  'https://uarb.novascotia.ca/fmi/webd/APP/connector/a/../file',
  'https://uarb.novascotia.ca/fmi/webd/APP/connector/%2e%2e/file',
  'https://uarb.novascotia.ca/fmi/webd/APP/connector/a%2fb',
  'https://uarb.novascotia.ca/fmi/webd/APP/connector/a%5cb',
  'https://uarb.novascotia.ca/fmi/webd/APP/connector/%zz', valid+'#fragment'];
const rejected = (error: unknown) => error instanceof FilingError && error.code === 'DOWNLOAD_FAILED';
function response(url = valid, status = 200, redirected = false) {
  const result = new Response('synthetic', { status });
  Object.defineProperties(result, { url: { value: url }, redirected: { value: redirected } });
  return result;
}
test('download origin and connector path are validated before a request is sent', async () => {
  assert.equal(downloadSourceUrl(valid).href, valid);
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return response(); };
  for (const url of invalid) {
    assert.throws(() => downloadSourceUrl(url), rejected);
    await assert.rejects(fetchDownloadSource(url, 'synthetic-cookie', new AbortController().signal, fetcher), rejected);
  }
  assert.equal(calls, 0);
});
test('source fetch forbids redirects and forwards cookies only to the validated URL', async () => {
  const signal = new AbortController().signal;
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, valid); assert.equal(init?.redirect, 'error'); assert.equal(init?.signal, signal);
    assert.deepEqual(init?.headers, { Cookie: 'synthetic-cookie' }); return response();
  };
  assert.equal((await fetchDownloadSource(valid, 'synthetic-cookie', signal, fetcher)).status, 200);
});
test('redirect statuses, redirected responses and unexpected final locations are rejected and cancelled', async () => {
  for (const result of [response(valid, 302), response(valid, 200, true), response('https://evil.invalid/file'), response(valid+'2')]) {
    await assert.rejects(fetchDownloadSource(valid, '', new AbortController().signal, async () => result), rejected);
    assert.equal(result.bodyUsed, true);
  }
});
