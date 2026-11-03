import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicAccessIssue } from '../src/uarb/access.js';
import { UarbClient } from '../src/uarb/client.js';
import { readConfig } from '../src/config.js';
import { FilingError } from '../src/domain.js';
test('public access requires an explicit label and tolerates display whitespace and case', () => {
  for (const label of ['Public',' public ','PUBLIC']) assert.equal(publicAccessIssue(label), null);
  for (const label of ['Restricted','Private','Confidential','Unknown','Public?','']) assert.ok(publicAccessIssue(label));
  assert.match(publicAccessIssue('  ')!, /visibility is missing/);
});
test('the source client refuses unverified attachments before accessing a browser', async () => {
  const client = new UarbClient(readConfig({ CACHE_BACKEND: 'off' }), '/unused');
  for (const security of ['', 'Restricted']) {
    const doc = { id: 'synthetic', title: 'Synthetic', security, date: '', extension: 'pdf' };
    const denied = (error: unknown) => error instanceof FilingError && error.code === 'NOT_PUBLIC';
    await assert.rejects(client.openAttachments(doc), denied);
    await assert.rejects(client.download(doc, 0, 'synthetic.pdf'), denied);
  }
});
