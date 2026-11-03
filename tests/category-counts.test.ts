import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENT_TYPES, FilingError } from '../src/domain.js';
import { parseCounts } from '../src/uarb/parse.js';
const labels = () => DOCUMENT_TYPES.map(type => `${type} - 0`);

test('all five counts accept zero, plain integers and correctly grouped thousands', () => {
  const observed = parseCounts(['Hearings', 'Search', ...DOCUMENT_TYPES.map((type, i) => ` ${type} - ${['13', '6', '44', '0', '0'][i]} `)]);
  assert.deepEqual(observed, { Exhibits: 13, 'Key Documents': 6, 'Other Documents': 44, Transcripts: 0, Recordings: 0 });
  assert.equal(parseCounts(['Exhibits - 1,234,567', ...labels().slice(1)]).Exhibits, 1234567);
});
for (const count of ['1,2', ',123', '123,', '1,,234', '-1', '1.5', '1e3', '01', '1,234 trailing', '9007199254740992', '']) {
  test(`count parser rejects malformed or unsafe value ${JSON.stringify(count)}`, () => {
    assert.throws(() => parseCounts([`Exhibits - ${count}`, ...labels().slice(1)]),
      (error: unknown) => error instanceof FilingError && error.code === 'PAGE_CHANGED');
  });
}
test('count parser rejects missing, renamed and duplicate categories', () => {
  for (const input of [labels().slice(1), ['Exhibit - 1', ...labels().slice(1)], [...labels(), 'Exhibits - 1'], [...labels(), 'Exhibits - invalid']]) {
    assert.throws(() => parseCounts(input), FilingError);
  }
});
