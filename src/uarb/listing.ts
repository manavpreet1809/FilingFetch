import { FilingError, type DocumentReference } from '../domain.js';

/** Account for unique document rows across overlapping virtualized windows. */
export class DocumentListing {
  private seen = new Map<string, string>();
  constructor(private expectedCount: number) {
    if (!Number.isSafeInteger(expectedCount) || expectedCount < 0) throw new FilingError('PAGE_CHANGED', 'Invalid document row count');
  }
  get size() { return this.seen.size; }
  observe(rows: DocumentReference[]): DocumentReference[] {
    const fresh: DocumentReference[] = [];
    for (const row of rows) {
      if (!row.id.trim()) throw new FilingError('PAGE_CHANGED', 'Document identifier is missing');
      const identity = JSON.stringify([row.title, row.date, row.security, row.extension]);
      const previous = this.seen.get(row.id);
      if (previous !== undefined && previous !== identity) throw new FilingError('PAGE_CHANGED', `Document ${row.id} changed during pagination`);
      if (previous !== undefined) continue;
      this.seen.set(row.id, identity);
      fresh.push(row);
    }
    if (this.size > this.expectedCount) throw new FilingError('PAGE_CHANGED', 'The document list exceeds its advertised count');
    if (!fresh.length) throw new FilingError('PAGE_CHANGED', 'Document pagination stopped making progress');
    return fresh;
  }
}
