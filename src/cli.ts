import { parseCliOptions } from './cli-options.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readConfig } from './config.js';
import { FilingError } from './domain.js';
import { createPool } from './db/client.js';
import { DocumentCache } from './cache/documents.js';
import { fetchDocuments } from './fetch.js';
import { createArchive } from './files/zip.js';

try {
  const { request, output, headed } = parseCliOptions(process.argv.slice(2));
  const config = readConfig();
  const pool = config.DATABASE_URL ? createPool(config.DATABASE_URL) : undefined;
  const directory = resolve(output ?? join('outputs', `${request.matterNumber}-${randomUUID().slice(0, 8)}`));
  try {
    await mkdir(directory, { recursive: true });
    const filesDirectory = join(directory, 'files');
    console.log(`Retrieving ${request.documentType} for ${request.matterNumber}...`);
    const result = await fetchDocuments(request, config, filesDirectory, new DocumentCache(config, pool), headed);
    const archive = result.files.length ? join(directory, `${request.matterNumber}-${request.documentType.replaceAll(' ', '-')}.zip`) : null;
    if (archive) await createArchive(result.files, archive, config.MAX_TOTAL_BYTES);
    const report = { ...result, files: result.files.map(({ path: _, ...file }) => file), archive: archive ? archive.split('/').pop() : null };
    await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ matter: result.matter.title, counts: result.matter.counts, downloaded: result.files.length, cacheHits: result.files.filter(file => file.cacheHit).length, skipped: result.skipped.length, warnings: result.warnings, archive, report: join(directory, 'report.json') }, null, 2));
    if (result.matter.counts[request.documentType] > 0 && !result.files.length) process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof FilingError ? `${error.code}: ${error.message}` : `Retrieval failed (${error instanceof Error ? error.name : 'unknown error'}). Check the failure screenshot and configuration.`);
    process.exitCode = 1;
  } finally { await pool?.end(); }

} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid command or configuration');
  process.exitCode = 1;
}
