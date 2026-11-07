import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync } from 'fflate';
import { FilingError, type FilingFile } from '../domain.js';
import { safeFilename } from './validate.js';

export async function createArchive(files: FilingFile[], output: string, maxBytes: number): Promise<void> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new FilingError('ARCHIVE_SIZE', 'Attachment budget must be a positive safe integer');
  if (!files.length) throw new FilingError('EMPTY_ARCHIVE', 'No valid files to archive');
  const entries: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  for (const file of files) {
    const bytes = await readFile(file.path);
    if (bytes.length !== file.size) throw new FilingError('FILE_CHANGED', 'File size changed before packaging');
    total += bytes.length;
    if (total > maxBytes) throw new FilingError('ARCHIVE_SIZE', 'Files exceed the attachment budget');
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new FilingError('FILE_CHANGED', 'File changed before packaging');
    if (['__proto__', 'constructor', 'prototype'].includes(file.filename) || file.filename !== safeFilename(file.filename) || Object.hasOwn(entries, file.filename)) throw new FilingError('ARCHIVE_NAME', 'Unsafe or duplicate archive filename');
    entries[file.filename] = bytes;
  }
  const archive = zipSync(entries, { level: 6 });
  if (archive.length > maxBytes) throw new FilingError('ARCHIVE_SIZE', 'ZIP exceeds the attachment budget');
  const unpacked = unzipSync(archive);
  for (const file of files) {
    if (createHash('sha256').update(unpacked[file.filename]!).digest('hex') !== file.sha256) throw new FilingError('INVALID_ARCHIVE', 'ZIP verification failed');
  }
  await writeFile(output, archive, { flag: 'wx' });
}
