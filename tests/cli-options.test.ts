import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCliOptions } from '../src/cli-options.js';
import { DOCUMENT_TYPES } from '../src/domain.js';

test('all five categories, normalized matter numbers, defaults, and limit boundaries are accepted', () => {
  for (const category of DOCUMENT_TYPES) {
    const options = parseCliOptions([' m12205 ', category]);
    assert.deepEqual(options.request, { matterNumber: 'M12205', documentType: category, limit: 10 });
    assert.equal(options.headed, false);
    assert.equal(options.output, undefined);
  }
  for (const limit of ['1', '10']) {
    const options = parseCliOptions(['M12205', 'Exhibits', '--limit', limit, '--headed', '--output', 'folder with spaces']);
    assert.equal(options.request.limit, Number(limit));
    assert.equal(options.headed, true);
    assert.equal(options.output, 'folder with spaces');
  }
});

const invalid: { label: string; args: string[]; message: RegExp }[] = [
  { label: 'missing arguments', args: [], message: /Expected a matter number/ },
  { label: 'missing category', args: ['M12205'], message: /Expected a matter number/ },
  { label: 'extra positional', args: ['M12205', 'Exhibits', 'extra'], message: /Expected a matter number/ },
  ...['M123', '12205', 'M123456', 'M12abc'].map(matter => ({ label: `bad matter ${matter}`, args: [matter, 'Exhibits'], message: /Matter number must be/ })),
  { label: 'unsupported category', args: ['M12205', 'Other'], message: /Document category must be/ },
  { label: 'wrong case category', args: ['M12205', 'exhibits'], message: /Document category must be/ },
  ...['0', '-1', '11', '1.5', 'NaN', 'Infinity', '', '1e1', '0xA'].map(limit => ({ label: `bad limit ${JSON.stringify(limit)}`, args: ['M12205', 'Exhibits', `--limit=${limit}`], message: /--limit must be/ })),
  { label: 'unknown option', args: ['M12205', 'Exhibits', '--unknown'], message: /Unknown option/ },
  { label: 'missing limit value', args: ['M12205', 'Exhibits', '--limit'], message: /argument missing/ },
  { label: 'missing output value', args: ['M12205', 'Exhibits', '--output'], message: /argument missing/ },
  { label: 'blank output', args: ['M12205', 'Exhibits', '--output=   '], message: /--output must be/ },
  { label: 'value for boolean option', args: ['M12205', 'Exhibits', '--headed=yes'], message: /does not take an argument/ },
];
for (const { label, args, message } of invalid) {
  test(`CLI rejects ${label} before configuration or retrieval`, () => {
    assert.throws(() => parseCliOptions(args), message);
    const directory = mkdtempSync(join(tmpdir(), 'filingfetch-cli-'));
    const output = join(directory, 'must-not-exist');
    try {
      const command = (args.some(arg => arg.startsWith('--output')) || args.at(-1) === '--limit') ? args : [...args, '--output', output];
      // Invalid settings would fail if configuration were reached. The argument error must win.
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...command], {
        encoding: 'utf8', timeout: 10_000, env: { ...process.env, CACHE_BACKEND: 'invalid-stage2-sentinel' },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stderr, message);
      assert.doesNotMatch(result.stderr, /Invalid configuration|at .*cli\.ts|Executable doesn't exist/);
      assert.doesNotMatch(result.stdout, /Retrieving/);
      assert.equal(existsSync(output), false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}
