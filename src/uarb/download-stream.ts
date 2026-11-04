import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname } from 'node:path';
import { publishUniqueFile } from '../files/names.js';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { FilingError } from '../domain.js';
import { fetchDownloadSource } from './download-source.js';

interface DownloadOptions {
  url: string;
  path: string;
  cookie: string;
  maxBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

/** Bound response headers and streamed bytes, publishing only a complete transfer. */
export async function saveBoundedDownload(options: DownloadOptions): Promise<{ path: string; filename: string }> {
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0
      || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 2_147_483_647) {
    throw new FilingError('DOWNLOAD_FAILED', 'Invalid download limits');
  }
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(new FilingError('DOWNLOAD_TIMEOUT', 'Download exceeded its time limit')), options.timeoutMs);
  const signal = AbortSignal.any([timeout.signal, ...(options.signal ? [options.signal] : [])]);
  const temporary = `${options.path}.${randomUUID()}.part`;
  let response: Response | undefined;
  try {
    signal.throwIfAborted();
    response = await fetchDownloadSource(options.url, options.cookie, signal, options.fetcher);
    signal.throwIfAborted();
    if (!response.ok || !response.body) throw new FilingError('DOWNLOAD_FAILED', `Source returned HTTP ${response.status}`);
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new FilingError('DOWNLOAD_FAILED', 'Invalid source content length');
    if (declared !== null && Number(declared) > options.maxBytes) throw new FilingError('FILE_SIZE', 'File exceeds the size limit');
    let received = 0;
    let header = Buffer.alloc(0);
    const limiter = new Transform({ transform(chunk: Buffer, _, callback) {
      received += chunk.length;
      header = Buffer.concat([header, chunk.subarray(0, Math.max(0, 12 - header.length))]);
      const waveSize = header.length === 12 && header.toString('ascii', 0, 4) === 'RIFF'
        && header.toString('ascii', 8, 12) === 'WAVE' ? header.readUInt32LE(4) + 8 : 0;
      callback(Math.max(received, waveSize) > options.maxBytes
        ? new FilingError('FILE_SIZE', 'File exceeds the size limit') : null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), limiter,
      createWriteStream(temporary, { flags: 'wx' }), { signal });
    signal.throwIfAborted();
    return await publishUniqueFile(temporary, dirname(options.path), basename(options.path));
  } catch (error) {
    if (signal.aborted) {
      if (signal.reason instanceof FilingError) throw signal.reason;
      throw new FilingError('DOWNLOAD_FAILED', 'Download cancelled');
    }
    if (error instanceof FilingError) throw error;
    throw new FilingError('DOWNLOAD_FAILED', 'Download failed or was interrupted');
  } finally {
    clearTimeout(timer);
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
    await rm(temporary, { force: true });
  }
}
