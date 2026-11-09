import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { GmailClient, GmailError } from './client.js';

interface HistoryPage {
  history?: { messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[] }[];
  historyId: string;
  nextPageToken?: string;
}

function historyId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) throw new Error('Invalid Gmail history cursor');
  return value;
}

function nextPage(value: string | undefined, seen: Set<string>): string | undefined {
  if (value !== undefined && (typeof value !== 'string' || !value || seen.has(value) || seen.size >= 1000)) throw new Error('Gmail pagination stopped making progress');
  if (value) seen.add(value);
  return value;
}

export class Inbox {
  constructor(private pool: Pool, private gmail: GmailClient) {}

  async renewWatch() {
    const topicName = process.env.GMAIL_TOPIC;
    if (!topicName) throw new Error('GMAIL_TOPIC is required');
    const existing = await this.pool.query('SELECT 1 FROM mailbox_cursors WHERE mailbox = $1 AND watch_expires_at > now() + interval \'1 day\'', [this.gmail.mailbox]);
    if (existing.rowCount) return;
    const watch = await this.gmail.request<{ historyId: string; expiration: string }>('watch', { topicName, labelIds: ['INBOX'], labelFilterBehavior: 'include' });
    historyId(watch.historyId);
    if (!Number.isFinite(Number(watch.expiration)) || Number(watch.expiration) <= Date.now()) throw new Error('Invalid Gmail watch expiration');
    await this.pool.query(`INSERT INTO mailbox_cursors (mailbox, history_id, watch_expires_at) VALUES ($1, $2, $3)
      ON CONFLICT (mailbox) DO UPDATE SET watch_expires_at = EXCLUDED.watch_expires_at`,
    [this.gmail.mailbox, watch.historyId, new Date(Number(watch.expiration))]);
    console.log(JSON.stringify({ event: 'watch_renewed', expiresAt: new Date(Number(watch.expiration)).toISOString() }));
  }

  private async insert(client: PoolClient, messages: { id: string; threadId: string; labelIds?: string[] }[]) {
    for (const message of messages) {
      if (!message.id || !message.threadId) throw new Error('Invalid Gmail message identity');
      if (message.labelIds?.some(label => ['SENT', 'DRAFT', 'SPAM', 'TRASH'].includes(label))) continue;
      await client.query(`INSERT INTO jobs (id, mailbox, gmail_message_id, gmail_thread_id)
        VALUES ($1, $2, $3, $4) ON CONFLICT (mailbox, gmail_message_id) DO NOTHING`,
      [randomUUID(), this.gmail.mailbox, message.id, message.threadId]);
    }
  }

  async sync() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{ history_id: string; updated_at: Date }>('SELECT history_id, updated_at FROM mailbox_cursors WHERE mailbox = $1 FOR UPDATE', [this.gmail.mailbox]);
      const cursor = row.rows[0];
      if (!cursor) throw new Error('Gmail watch must be initialized first');
      let latestHistoryId = historyId(cursor.history_id);
      const seen = new Set<string>();
      let pageToken: string | undefined;
      try {
        do {
          const query = new URLSearchParams({ startHistoryId: cursor.history_id, historyTypes: 'messageAdded', labelId: 'INBOX', maxResults: '100' });
          if (pageToken) query.set('pageToken', pageToken);
          const page = await this.gmail.request<HistoryPage>(`history?${query}`);
          for (const item of page.history ?? []) await this.insert(client, (item.messagesAdded ?? []).map(item => item.message));
          const observed = historyId(page.historyId);
          if (BigInt(observed) < BigInt(latestHistoryId)) throw new Error('Gmail history cursor regressed');
          latestHistoryId = observed;
          pageToken = nextPage(page.nextPageToken, seen);
        } while (pageToken);
      } catch (error) {
        if (!(error instanceof GmailError) || error.status !== 404) throw error;
        // Capture the new cursor before listing so mail arriving during recovery is not lost.
        const profile = await this.gmail.request<{ historyId: string }>('profile');
        latestHistoryId = historyId(profile.historyId);
        if (BigInt(latestHistoryId) < BigInt(cursor.history_id)) throw new Error('Gmail recovery cursor regressed');
        if (!Number.isFinite(cursor.updated_at.getTime())) throw new Error('Invalid Gmail cursor timestamp');
        pageToken = undefined;
        seen.clear();
        do {
          const query = new URLSearchParams({ q: `in:inbox after:${Math.floor(cursor.updated_at.getTime() / 1000) - 60}`, maxResults: '100' });
          if (pageToken) query.set('pageToken', pageToken);
          const page = await this.gmail.request<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>(`messages?${query}`);
          await this.insert(client, page.messages ?? []);
          pageToken = nextPage(page.nextPageToken, seen);
        } while (pageToken);
      }
      await client.query('UPDATE mailbox_cursors SET history_id = $2, updated_at = now() WHERE mailbox = $1', [this.gmail.mailbox, latestHistoryId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
  }
}
