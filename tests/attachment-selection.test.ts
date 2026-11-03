import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertDocumentSelection, AttachmentSelection } from '../src/uarb/attachments.js';
import { type DocumentReference, FilingError } from '../src/domain.js';
import { UarbClient } from '../src/uarb/client.js';
import { readConfig } from '../src/config.js';
const doc: DocumentReference = { id: 'synthetic-1', rowKey: 'reused-row', title: 'Synthetic document', date: '01/01/2026', security: 'Public', extension: 'pdf' };
const changed = (error: unknown) => error instanceof FilingError && error.code === 'PAGE_CHANGED';
test('row selection checks all identity fields and does not trust recycled row keys', () => {
  assert.doesNotThrow(() => assertDocumentSelection(doc, [{ ...doc }]));
  for (const field of ['id','title','date','security','extension','rowKey'] as const) {
    assert.throws(() => assertDocumentSelection(doc, [{ ...doc, [field]: 'changed' }]), changed);
  }
  assert.throws(() => assertDocumentSelection(doc, []), changed);
  assert.throws(() => assertDocumentSelection(doc, [doc,doc]), changed);
});
test('rows without DOM keys must still have one exact document identity', () => {
  const { rowKey: _, ...keyless } = doc;
  assert.doesNotThrow(() => assertDocumentSelection(keyless, [{ ...keyless }]));
  assert.throws(() => assertDocumentSelection(keyless, [{ ...keyless, title: 'stale' }]), changed);
  assert.throws(() => assertDocumentSelection(keyless, [keyless,keyless]), changed);
});
test('download binds document, index and the entire attachment list', () => {
  const selection = new AttachmentSelection(); const names = ['one.pdf','two.pdf'];
  selection.bind(doc, names); names[0] = 'mutated.pdf';
  assert.doesNotThrow(() => selection.assertDownload(doc, 1, 'two.pdf', ['one.pdf','two.pdf']));
  for (const list of [['replacement.pdf','two.pdf'],['one.pdf','two.pdf','extra.pdf'],['two.pdf','one.pdf'],['one.pdf']]) {
    assert.throws(() => selection.assertDownload(doc, 1, 'two.pdf', list), changed);
  }
  for (const index of [-1, 2, 0.5, NaN]) assert.throws(() => selection.assertDownload(doc, index, 'one.pdf', ['one.pdf','two.pdf']), changed);
  assert.throws(() => selection.assertDownload({ ...doc, id: 'other' }, 0, 'one.pdf', ['one.pdf','two.pdf']), changed);
  assert.throws(() => selection.assertDownload(doc, 0, 'wrong.pdf', ['one.pdf','two.pdf']), changed);
});
test('closing a dialog invalidates selection and retries cannot replace its baseline', () => {
  const selection = new AttachmentSelection(); selection.bind(doc, ['one.pdf']); selection.clear();
  assert.throws(() => selection.assertDownload(doc, 0, 'one.pdf', ['one.pdf']), changed);
  selection.bind(doc, ['one.pdf']);
  assert.throws(() => selection.bind(doc, ['replacement.pdf']), changed);
  assert.throws(() => selection.assertDownload(doc, 0, 'one.pdf', ['one.pdf']), changed);
  for (const names of [[], [' ']]) assert.throws(() => selection.bind(doc, names), changed);
});

test('source opening rejects a stale row before invoking its browser controls', async () => {
  const client = new UarbClient(readConfig({ CACHE_BACKEND: 'off' }), '/unused');
  client.closeAttachments = async () => {};
  client.visibleDocuments = async () => [{ ...doc, title: 'Recycled row' }];
  await assert.rejects(client.openAttachments(doc), changed);
});
test('source download checks the full dialog before installing listeners or clicking', async () => {
  const client = new UarbClient(readConfig({ CACHE_BACKEND: 'off' }), '/unused');
  client.visibleDocuments = async () => [{ ...doc }];
  const state = client as unknown as { page: unknown; attachments: AttachmentSelection };
  state.attachments.bind(doc, ['one.pdf','two.pdf']);
  let clicks = 0;
  state.page = { locator: () => ({ allTextContents: async () => ['replacement.pdf','two.pdf'], nth: () => ({ click: async () => { clicks++; } }) }) };
  await assert.rejects(client.download(doc, 1, 'two.pdf'), changed);
  assert.equal(clicks, 0);
});
