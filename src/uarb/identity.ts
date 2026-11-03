import { FilingError } from '../domain.js';

/** Verify source identity before using either empty or populated matter results. */
export function assertMatterIdentity(expected: string, number: string, title: string): void {
  if (number.trim() !== expected) throw new FilingError('WRONG_MATTER', 'The website returned a different matter');
  if (!title.trim()) throw new FilingError('PAGE_CHANGED', 'Matter title is missing');
}
