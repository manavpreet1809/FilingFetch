import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentListing } from '../src/uarb/listing.js';
import { type DocumentReference, FilingError } from '../src/domain.js';
const doc = (id: string, rowKey = 'recycled'): DocumentReference => ({ id, rowKey, title: `Synthetic ${id}`, date: '', security: 'Public', extension: 'pdf' });
test('overlapping windows account for every unique row despite recycled DOM keys', () => {
  const listing = new DocumentListing(5);
  const rows = [[doc('1'), doc('2')], [doc('2', 'new-key'), doc('3'), doc('4')], [doc('4'), doc('5')]];
  assert.deepEqual(rows.flatMap(page => listing.observe(page)).map(row => row.id), ['1','2','3','4','5']);
  assert.equal(listing.size, 5);
});
test('pagination rejects repeated windows instead of looping indefinitely', () => {
  const listing = new DocumentListing(5); listing.observe([doc('1')]);
  assert.throws(() => listing.observe([doc('1')]), /stopped making progress/);
});
test('pagination rejects changed identity, missing IDs and stale counts', () => {
  const listing = new DocumentListing(2); listing.observe([doc('1')]);
  assert.throws(() => listing.observe([{ ...doc('1'), title: 'Changed' }]), /changed during pagination/);
  assert.throws(() => new DocumentListing(1).observe([doc('')]), FilingError);
  assert.throws(() => new DocumentListing(1).observe([doc('1'),doc('2')]), /advertised count/);
  for (const count of [-1, NaN, Infinity, 1.5]) assert.throws(() => new DocumentListing(count), FilingError);
});
