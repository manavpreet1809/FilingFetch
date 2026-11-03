import { FilingError, type DocumentReference } from '../domain.js';

const identity = (doc: DocumentReference) => JSON.stringify([doc.id, doc.title, doc.date, doc.security, doc.extension]);
function changed(message: string): never { throw new FilingError('PAGE_CHANGED', message); }

/** Reject recycled DOM keys, duplicate matches and changed row metadata. */
export function assertDocumentSelection(expected: DocumentReference, visible: DocumentReference[]): void {
  const candidates = visible.filter(row => expected.rowKey !== undefined ? row.rowKey === expected.rowKey : row.id === expected.id);
  if (candidates.length !== 1 || identity(candidates[0]!) !== identity(expected)) changed('The selected document row changed');
}

/** Bind every click to the complete observed dialog and document identity. */
export class AttachmentSelection {
  private active?: { document: DocumentReference; names: string[] };
  private baselines = new Map<string, string>();
  bind(document: DocumentReference, names: string[]): void {
    this.clear();
    if (!names.length || names.some(name => !name.trim())) changed('Attachment filenames are missing');
    const signature = JSON.stringify([identity(document), names]);
    const previous = this.baselines.get(document.id);
    if (previous !== undefined && previous !== signature) changed('Attachment list changed while reopening the document');
    this.baselines.set(document.id, signature);
    this.active = { document: { ...document }, names: [...names] };
  }
  assertDownload(document: DocumentReference, index: number, filename: string, currentNames: string[]): void {
    const active = this.active;
    if (!active || identity(active.document) !== identity(document) || active.document.rowKey !== document.rowKey) changed('No matching attachment selection is open');
    if (!Number.isSafeInteger(index) || index < 0 || index >= active.names.length) changed('Invalid attachment index');
    if (active.names[index] !== filename || JSON.stringify(active.names) !== JSON.stringify(currentNames)) changed('Attachment list changed while downloading');
  }
  clear(): void { this.active = undefined; }
}
