import { link, lstat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { FilingError } from '../domain.js';
import { safeFilename } from './validate.js';

/** Publish without replacing any existing file or symlink, even concurrently. */
export async function publishUniqueFile(temporary: string, directory: string, proposedName: string): Promise<{ path: string; filename: string }> {
  const root = resolve(directory);
  if (dirname(resolve(temporary)) !== root || !(await lstat(temporary)).isFile()) throw new FilingError('UNSAFE_PATH', 'Temporary file is outside the output directory or is not a regular file');
  const clean = safeFilename(proposedName);
  const extension = extname(clean);
  const stem = clean.slice(0, clean.length - extension.length);
  for (let index = 0; index < 10_000; index++) {
    const suffix = index ? `-${index}` : '';
    const filename = `${stem.slice(0, 160 - extension.length - suffix.length)}${suffix}${extension}`;
    const path = join(root, filename);
    try { await link(temporary, path); return { path, filename }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  throw new FilingError('FILENAME_COLLISION', 'Too many output filename collisions');
}
