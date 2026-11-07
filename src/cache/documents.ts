import { createHash, randomUUID } from 'node:crypto';
import { mkdir, copyFile, readFile, writeFile, rename, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { Storage } from '@google-cloud/storage';
import type { Pool } from 'pg';
import type { Config } from '../config.js';
import type { DocumentReference, FilingFile, FilingRequest } from '../domain.js';
import { validateFile, safeFilename } from '../files/validate.js';
import { publishUniqueFile } from '../files/names.js';

interface StoredFile extends Omit<FilingFile, 'path' | 'cacheHit'> { key: string }
interface Entry { fingerprint: string; expiresAt: string; files: StoredFile[] }

const entrySchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.union([z.string(), z.date()]).refine(value => Number.isFinite(new Date(value).getTime())),
  files: z.array(z.object({
    key: z.string().regex(/^objects\/[a-f0-9]{64}$/),
    filename: z.string().min(1), size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/), mimeType: z.string().min(1),
    validation: z.enum(['pdf-parsed', 'signature', 'text', 'office-container']),
    documentId: z.string().min(1), documentTitle: z.string(), originalFilename: z.string(),
    downloadedAt: z.string().datetime(),
  })).min(1),
});

export function fingerprint(doc: DocumentReference): string {
  return createHash('sha256').update(JSON.stringify([doc.id, doc.title, doc.date, doc.extension, doc.security])).digest('hex');
}

export class DocumentCache {
  private storage: Storage | undefined;
  private namespace: string;
  constructor(private config: Config, private pool?: Pool) {
    this.namespace = config.CACHE_BACKEND === 'gcs' ? `gcs:${config.GCS_CACHE_BUCKET}` : `local:${config.CACHE_DIRECTORY}`;
    if (config.CACHE_BACKEND === 'gcs') this.storage = new Storage({ projectId: config.GOOGLE_CLOUD_PROJECT });
  }

  private identity(request: FilingRequest, doc: DocumentReference) {
    return [this.namespace, request.matterNumber, request.documentType, doc.id];
  }

  private manifestPath(request: FilingRequest, doc: DocumentReference) {
    const hash = createHash('sha256').update(JSON.stringify(this.identity(request, doc))).digest('hex');
    return join(this.config.CACHE_DIRECTORY, 'manifests', `${hash}.json`);
  }

  async get(request: FilingRequest, doc: DocumentReference, directory: string, limit: number): Promise<FilingFile[] | null> {
    if (this.config.CACHE_BACKEND === 'off') return null;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new Error('Invalid cache retrieval limit');
    let entry: unknown;
    if (this.pool) {
      const { rows } = await this.pool.query('SELECT source_fingerprint AS fingerprint, expires_at AS "expiresAt", files FROM cached_documents WHERE namespace=$1 AND matter_number=$2 AND document_type=$3 AND document_id=$4', this.identity(request, doc));
      entry = rows[0];
    } else {
      try { entry = JSON.parse(await readFile(this.manifestPath(request, doc), 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    }
    if (!entry) return null;
    const parsed = entrySchema.safeParse(entry);
    if (!parsed.success) throw new Error('Invalid cache manifest');
    const accepted = parsed.data;
    if (accepted.fingerprint !== fingerprint(doc) || new Date(accepted.expiresAt).getTime() <= Date.now()) return null;
    const result: FilingFile[] = [];
    try {
    for (const file of accepted.files.slice(0, limit)) {
      if (file.documentId !== doc.id || file.key !== `objects/${file.sha256}` || file.filename !== safeFilename(file.filename)) throw new Error('Invalid cache manifest');
      const temporary = join(directory, `.cache-${randomUUID()}.part`);
      const reservation = await open(temporary, 'wx');
      await reservation.close();
      try {
        if (this.storage) await this.storage.bucket(this.config.GCS_CACHE_BUCKET!).file(file.key).download({ destination: temporary, validation: 'crc32c' });
        else await copyFile(join(this.config.CACHE_DIRECTORY, file.key), temporary);
        const validated = await validateFile(temporary, file.filename, this.config.MAX_FILE_BYTES);
        if (validated.sha256 !== file.sha256 || validated.size !== file.size) throw new Error('Cached file failed integrity check');
        const published = await publishUniqueFile(temporary, directory, file.filename);
        const { key: _, ...metadata } = file;
        result.push({ ...metadata, ...validated, ...published, cacheHit: true });
      } finally { await rm(temporary, { force: true }); }
    }
    return result;
    } catch (error) {
      await Promise.all(result.map(file => rm(file.path, { force: true })));
      throw error;
    }
  }

  async put(request: FilingRequest, doc: DocumentReference, files: FilingFile[]): Promise<void> {
    if (this.config.CACHE_BACKEND === 'off' || !files.length) return;
    const stored: StoredFile[] = [];
    for (const file of files) {
      const key = `objects/${file.sha256}`;
      if (this.storage) {
        try {
          await this.storage.bucket(this.config.GCS_CACHE_BUCKET!).upload(file.path, { destination: key, resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: file.mimeType } });
        } catch (error) { if ((error as { code?: number }).code !== 412) throw error; }
      } else {
        const destination = join(this.config.CACHE_DIRECTORY, key);
        await mkdir(join(this.config.CACHE_DIRECTORY, 'objects'), { recursive: true });
        const temporary = `${destination}.${randomUUID()}.tmp`;
        await copyFile(file.path, temporary);
        await rename(temporary, destination);
      }
      const { path: _, cacheHit: __, ...metadata } = file;
      stored.push({ ...metadata, key });
    }
    const entry: Entry = { fingerprint: fingerprint(doc), files: stored, expiresAt: new Date(Date.now() + this.config.CACHE_TTL_SECONDS * 1000).toISOString() };
    if (this.pool) {
      await this.pool.query(`INSERT INTO cached_documents(namespace,matter_number,document_type,document_id,source_fingerprint,files,expires_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT(namespace,matter_number,document_type,document_id)
        DO UPDATE SET source_fingerprint=EXCLUDED.source_fingerprint,files=EXCLUDED.files,cached_at=now(),expires_at=EXCLUDED.expires_at`, [...this.identity(request, doc), entry.fingerprint, JSON.stringify(stored), entry.expiresAt]);
    } else {
      const path = this.manifestPath(request, doc);
      await mkdir(join(this.config.CACHE_DIRECTORY, 'manifests'), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(entry));
      await rename(temporary, path);
    }
  }
}
