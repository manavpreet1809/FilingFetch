import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { FetchResult } from './domain.js';

/** Serialize accepted-file evidence without exposing local filesystem paths. */
export function createRetrievalReport(result: FetchResult, archive: string | null) {
  return {
    schemaVersion: 1,
    ...result,
    files: result.files.map(({ path: _, ...file }) => file),
    archive: archive === null ? null : basename(archive),
    summary: {
      selectedCategoryDocuments: result.matter.counts[result.request.documentType],
      acceptedFiles: result.files.length,
      acceptedBytes: result.files.reduce((total, file) => total + file.size, 0),
      cacheHits: result.files.filter(file => file.cacheHit).length,
      skippedEntries: result.skipped.length,
      warningCount: result.warnings.length,
    },
  };
}

export async function writeRetrievalReport(result: FetchResult, archive: string | null, output: string): Promise<void> {
  await writeFile(output, JSON.stringify(createRetrievalReport(result, archive), null, 2), { flag: 'wx' });
}
