import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertMatterIdentity } from '../src/uarb/identity.js';
import { FilingError } from '../src/domain.js';

test('source identity accepts an exact matter and a nonempty title', () => {
  assert.doesNotThrow(() => assertMatterIdentity('M12205', ' M12205 ', 'Fixture matter'));
});
test('source identity rejects mismatches and missing identifiers', () => {
  for (const number of ['M99999', '', 'm12205', 'M122050']) {
    assert.throws(() => assertMatterIdentity('M12205', number, 'Fixture matter'),
      (error: unknown) => error instanceof FilingError && error.code === 'WRONG_MATTER');
  }
});
test('source identity requires a title even for an empty matter', () => {
  for (const title of ['', '  ']) {
    assert.throws(() => assertMatterIdentity('M12205', 'M12205', title),
      (error: unknown) => error instanceof FilingError && error.code === 'PAGE_CHANGED');
  }
});
