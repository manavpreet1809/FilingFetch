import type { Pool } from 'pg';

/** Preserve active and uncertain-delivery jobs while removing expired terminal records. */
export async function purgeExpiredRecords(pool: Pool): Promise<void> {
  await pool.query('DELETE FROM cached_documents WHERE expires_at < now()');
  await pool.query("DELETE FROM jobs WHERE status IN ('completed', 'failed', 'needs_clarification') AND updated_at < now() - interval '30 days'");
}
