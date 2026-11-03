import { DOCUMENT_TYPES, FilingError, type DocumentType } from '../domain.js';

export function parseCounts(labels: string[]): Record<DocumentType, number> {
  return Object.fromEntries(DOCUMENT_TYPES.map(type => {
    const candidates = labels.map(label => label.trim()).filter(label => label.startsWith(`${type} -`));
    const match = candidates.length === 1
      ? candidates[0]!.match(new RegExp(`^${type} -\\s*(0|[1-9]\\d*|[1-9]\\d{0,2}(?:,\\d{3})+)\\s*$`))
      : null;
    const count = match ? Number(match[1]!.replaceAll(',', '')) : NaN;
    if (!Number.isSafeInteger(count) || count < 0) throw new FilingError('PAGE_CHANGED', `Could not read one unambiguous ${type} count`);
    return [type, count];
  })) as Record<DocumentType, number>;
}

export function parseDate(value: string): string | null {
  if (!value.trim()) return null;
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new FilingError('PAGE_CHANGED', 'Unexpected date format');
  const date = `${match[3]}-${match[1]}-${match[2]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new FilingError('PAGE_CHANGED', 'Invalid date');
  return date;
}
