import { chromium, type Browser, type Page, type Locator, type Download, type Request } from 'playwright';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Config } from '../config.js';
import { DOCUMENT_TYPES, FilingError, type DocumentReference, type FilingRequest, type Matter } from '../domain.js';
import { parseCounts, parseDate } from './parse.js';
import { assertMatterIdentity } from './identity.js';
import { publicAccessIssue } from './access.js';
import { assertDocumentSelection, AttachmentSelection } from './attachments.js';
import { safeFilename } from '../files/validate.js';
import { downloadSourceUrl } from './download-source.js';
import { saveBoundedDownload } from './download-stream.js';

export const UARB_URL = 'https://uarb.novascotia.ca/fmi/webd/UARB15';

export class UarbClient {
  private browser?: Browser;
  private page?: Page;
  private timer?: NodeJS.Timeout;
  private expired = false;
  private jobAbort = new AbortController();
  private idField = 201;
  private extensionField = 308;
  private datedRows = false;
  private attachments = new AttachmentSelection();
  constructor(private config: Config, private directory: string, private headed = false) {}

  async open(request: FilingRequest): Promise<Matter> {
    this.browser = await chromium.launch({ headless: !this.headed });
    this.timer = setTimeout(() => {
      this.expired = true;
      this.jobAbort.abort(new FilingError('JOB_TIMEOUT', 'Retrieval exceeded its time limit'));
      void this.browser?.close().catch(() => {});
    }, this.config.JOB_TIMEOUT_MS);
    this.page = await this.browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 720 } });
    this.page.setDefaultTimeout(this.config.STEP_TIMEOUT_MS);
    await this.page.goto(UARB_URL, { waitUntil: 'domcontentloaded' });
    const input = this.page.locator('.inner_border').filter({ has: this.page.getByText('eg M01234', { exact: true }) }).locator('.text');
    await input.click();
    await this.page.locator('[contenteditable="true"]').fill(request.matterNumber);
    await this.page.locator('[contenteditable="true"]').press('Tab');
    await this.page.locator('#b0p0o258i0i0r1').click();
    try { await this.page.getByRole('button').filter({ hasText: /^Exhibits -/ }).waitFor(); }
    catch { throw new FilingError('MATTER_NOT_FOUND', `Could not open ${request.matterNumber}; check the matter number or try again`); }
    await this.waitForCounts();
    const initialCounts = parseCounts(await this.page.locator('button').allTextContents());
    const selectedType = initialCounts[request.documentType] ? request.documentType : DOCUMENT_TYPES.find(type => initialCounts[type] > 0);
    if (!selectedType) {
      const field = async (id: number) => (await this.page!.locator(`.fm_object_${id}`).innerText()).trim();
      const number = await field(286);
      const title = (await this.page.locator('#b0p0o290i0i0r1').innerText()).trim();
      assertMatterIdentity(request.matterNumber, number, title);
      return {
        number, title,
        status: await field(289) || null, type: await field(287) || null, category: await field(298) || null,
        receivedDate: parseDate(await field(292)), finalSubmissionDate: null, decisionDate: parseDate(await field(294)),
        outcome: await field(295) || null, counts: initialCounts, totalDocuments: 0, retrievedAt: new Date().toISOString(), sourceUrl: UARB_URL,
      };
    }
    this.idField = selectedType === 'Key Documents' ? 268 : selectedType === 'Exhibits' ? 300 : 201;
    this.extensionField = selectedType === 'Key Documents' ? 284 : selectedType === 'Exhibits' ? 314 : 308;
    this.datedRows = selectedType === 'Transcripts' || selectedType === 'Recordings';
    await this.page.getByRole('button').filter({ hasText: new RegExp(`^${selectedType} -`) }).click();
    await this.page.waitForFunction(() => Boolean(document.querySelector('.fm_object_219')?.textContent?.trim()));
    await this.page.waitForFunction(expected => document.querySelector('table[role="grid"]')?.getAttribute('aria-rowcount') === String(expected), initialCounts[selectedType]);
    await this.page.locator('tr.v-grid-row-has-data').first().getByRole('button').filter({ hasText: /^GO GET IT$/ }).waitFor();
    await this.page.locator('.v-loading-indicator').waitFor({ state: 'hidden' });
    const field = async (id: number) => (await this.page!.locator(`.fm_object_${id}`).innerText()).trim();
    const number = await field(219);
    const counts = initialCounts;
    const title = (await this.page.locator('#b0p0o223i0i0r1').innerText()).trim();
    assertMatterIdentity(request.matterNumber, number, title);
    return {
      number, title, status: await field(222) || null, type: await field(220) || null,
      category: await field(231) || null, receivedDate: parseDate(await field(225)),
      finalSubmissionDate: parseDate(await field(227)), outcome: await field(228) || null,
      counts, totalDocuments: Object.values(counts).reduce((sum, count) => sum + count, 0),
      retrievedAt: new Date().toISOString(), sourceUrl: UARB_URL,
    };
  }

  private rows() { return this.page!.locator('tr.v-grid-row-has-data'); }

  private async waitForCounts() {
    await this.page!.waitForFunction(types => types.every(type => Array.from(document.querySelectorAll('button')).some(button => new RegExp(`^${type} -\\s*[\\d,]+\\s*$`).test(button.textContent?.trim() ?? ''))), DOCUMENT_TYPES);
  }

  async visibleDocuments(): Promise<DocumentReference[]> {
    const documents = await this.rows().evaluateAll((rows, fields) => rows.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).flatMap(row => {
      const id = row.querySelector(`.fm_object_${fields.id}`)?.textContent?.trim() ?? '';
      const title = Array.from(row.querySelectorAll('.fm_object_202')).map(el => el.textContent?.trim()).filter(Boolean).join(' | ');
      return id ? [{ id,
        rowKey: row.querySelector(`.fm_object_${fields.id}`)?.id,
        position: Math.round(new DOMMatrix(getComputedStyle(row).transform).m42 / row.getBoundingClientRect().height),
        title,
        date: fields.dated ? id : row.querySelector('.fm_object_203')?.textContent?.trim() ?? '',
        security: row.querySelector('.fm_object_204')?.textContent?.trim() ?? '',
        extension: fields.dated ? '' : row.querySelector(`.fm_object_${fields.extension}`)?.textContent?.trim() ?? '',
      }] : [];
    }), { id: this.idField, extension: this.extensionField, dated: this.datedRows });
    return documents.map(({ position, ...doc }) => ({ ...doc, id: this.datedRows ? `row-${position}-${createHash('sha256').update(`${doc.date}|${doc.title}`).digest('hex').slice(0, 16)}` : doc.id }));
  }

  async nextPage(): Promise<boolean> {
    const scroller = this.page!.locator('.v-grid-scroller-vertical');
    const before = await this.rows().evaluateAll(rows => rows.map(row => `${(row as HTMLElement).style.transform}:${row.textContent}`).join('|'));
    const moved = await scroller.evaluate(el => {
      const previous = el.scrollTop;
      el.scrollTop = Math.min(el.scrollTop + Math.max(68, el.clientHeight - 68), el.scrollHeight - el.clientHeight);
      return el.scrollTop > previous;
    });
    if (!moved) return false;
    await this.page!.waitForFunction(({ previous, field }) => {
      const rows = Array.from(document.querySelectorAll('tr.v-grid-row-has-data'));
      const content = rows.map(row => `${(row as HTMLElement).style.transform}:${row.textContent}`).join('|');
      return rows.length > 0 && content !== previous && rows.every(row => row.querySelector(`.fm_object_${field}`)?.textContent?.trim() && row.querySelector('.fm_object_202'));
    }, { previous: before, field: this.idField });
    await this.page!.locator('.v-loading-indicator').waitFor({ state: 'hidden' });
    return true;
  }

  private row(doc: DocumentReference): Locator {
    if (doc.rowKey) return this.rows().filter({ has: this.page!.locator(`[id="${doc.rowKey}"]`) });
    const escaped = doc.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.rows().filter({ has: this.page!.locator(`.fm_object_${this.idField}`).filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) }) });
  }

  async openAttachments(doc: DocumentReference): Promise<string[]> {
    const accessIssue = publicAccessIssue(doc.security);
    if (accessIssue) throw new FilingError('NOT_PUBLIC', accessIssue);
    await this.closeAttachments();
    assertDocumentSelection(doc, await this.visibleDocuments());
    await this.row(doc).getByRole('button').filter({ hasText: /^GO GET IT$/ }).click();
    await this.page!.getByText('Export Field to File', { exact: true }).or(this.page!.getByText('Download Files', { exact: true })).first().waitFor();
    if (await this.page!.getByText('Export Field to File', { exact: true }).isVisible()) {
      await this.page!.getByRole('button').filter({ hasText: /^OK$/ }).click();
    }
    await this.page!.getByText('Download Files', { exact: true }).waitFor();
    const buttons = this.page!.locator('.fm-download-button');
    await buttons.first().waitFor();
    const names = (await buttons.allTextContents()).map(name => name.trim());
    this.attachments.bind(doc, names);
    return names;
  }

  async download(doc: DocumentReference, attachmentIndex: number, filename: string): Promise<{ path: string; filename: string }> {
    const accessIssue = publicAccessIssue(doc.security);
    if (accessIssue) throw new FilingError('NOT_PUBLIC', accessIssue);
    assertDocumentSelection(doc, await this.visibleDocuments());
    const names = (await this.page!.locator('.fm-download-button').allTextContents()).map(name => name.trim());
    this.attachments.assertDownload(doc, attachmentIndex, filename, names);
    const button = this.page!.locator('.fm-download-button').nth(attachmentIndex);
    type Source = { download: Download } | { malformedHeaderUrl: string };
    let resolve!: (source: Source) => void;
    let reject!: (error: Error) => void;
    const event = new Promise<Source>((yes, no) => { resolve = yes; reject = no; });
    const onDownload = (download: Download) => {
      // Linux Chromium can report a UTF-8 attachment as simply "download".
      try {
        downloadSourceUrl(download.url());
        resolve({ download });
      } catch {
        void download.cancel().catch(() => {});
        reject(new FilingError('DOWNLOAD_FAILED', 'Unexpected download location'));
      }
    };
    const onFailure = (request: Request) => {
      if (!request.failure()?.errorText.includes('ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION')) return;
      try { downloadSourceUrl(request.url()); resolve({ malformedHeaderUrl: request.url() }); }
      catch { reject(new FilingError('DOWNLOAD_FAILED', 'Unexpected download location')); }
    };
    this.page!.on('download', onDownload);
    this.page!.on('requestfailed', onFailure);
    const timeout = setTimeout(() => reject(new FilingError('DOWNLOAD_FAILED', 'Download did not start before the timeout')), this.config.DOWNLOAD_TIMEOUT_MS);
    let source: Source;
    try { [source] = await Promise.all([event, button.click()]); }
    finally {
      clearTimeout(timeout);
      this.page!.off('download', onDownload);
      this.page!.off('requestfailed', onFailure);
    }
    if ('malformedHeaderUrl' in source) return this.downloadFromSource(source.malformedHeaderUrl, doc, attachmentIndex, filename);
    const { download } = source;
    const url = download.url();
    // Stream the observed source URL so size checks run before the whole file downloads.
    await download.cancel();
    try { return await this.downloadFromSource(url, doc, attachmentIndex, filename); }
    finally { await download.delete().catch(() => {}); }
  }

  private async downloadFromSource(url: string, doc: DocumentReference, index: number, originalFilename: string) {
    downloadSourceUrl(url);
    const filename = safeFilename(`${doc.id}-${index + 1}-${originalFilename}`);
    const path = join(this.directory, filename);
    const cookies = await this.page!.context().cookies(url);
    return await saveBoundedDownload({
      url, path, cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
      maxBytes: this.config.MAX_FILE_BYTES, timeoutMs: this.config.DOWNLOAD_TIMEOUT_MS,
      signal: this.jobAbort.signal,
    });
  }

  async closeAttachments(): Promise<void> {
    this.attachments.clear();
    if (!this.page || this.page.isClosed()) return;
    const close = this.page?.getByRole('button').filter({ hasText: /^Close$/ });
    if (close && await close.isVisible()) {
      await close.click();
      await close.waitFor({ state: 'hidden' });
    }
    if (await this.page?.getByText('Export Field to File', { exact: true }).isVisible()) {
      await this.page!.getByRole('button').filter({ hasText: /^Cancel$/ }).click();
      await this.page!.getByText('Export Field to File', { exact: true }).waitFor({ state: 'hidden' });
    }
    if (this.page && !this.page.isClosed()) await this.page.locator('.v-loading-indicator').waitFor({ state: 'hidden' });
  }

  async screenshot(): Promise<void> {
    if (this.page && !this.page.isClosed()) await this.page.screenshot({ path: join(this.directory, 'failure.png'), fullPage: true }).catch(() => {});
  }

  get timedOut() { return this.expired; }

  async close(): Promise<void> {
    clearTimeout(this.timer);
    this.jobAbort.abort(new FilingError('DOWNLOAD_FAILED', 'Retrieval closed'));
    await this.browser?.close();
  }
}
