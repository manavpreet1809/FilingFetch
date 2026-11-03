/** Only an explicit Public label authorizes cache lookup or attachment access. */
export function publicAccessIssue(security: string): string | null {
  const label = security.trim();
  if (!label) return 'Document visibility is missing; public access could not be verified';
  return label.toLowerCase() === 'public' ? null : 'Document is not public';
}
