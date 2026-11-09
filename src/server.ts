import { createServer } from 'node:http';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { createRequestHandler } from './http.js';
import { readConfig } from './config.js';
import { createPool } from './db/client.js';
import { GmailClient } from './gmail/client.js';
import { Inbox } from './gmail/inbox.js';
import { JobRunner } from './jobs.js';
import { purgeExpiredRecords } from './maintenance.js';

const config = readConfig();
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = createPool(config.DATABASE_URL);
const identity = new OAuth2Client();
let services: Promise<{ inbox: Inbox; jobs: JobRunner }> | undefined;
function getServices() {
  return services ??= GmailClient.create().then(gmail => ({ inbox: new Inbox(pool, gmail), jobs: new JobRunner(pool, gmail, config) })).catch(error => { services = undefined; throw error; });
}

const runtime = z.object({
  AGENT_EMAIL: z.string().email(), SERVICE_URL: z.string().url().startsWith('https://'),
  CALLER_SERVICE_ACCOUNT: z.string().email(), TASK_QUEUE: z.string().min(1), GMAIL_TOPIC: z.string().min(1),
}).parse(process.env);
const server = createServer(createRequestHandler({
  mailbox: runtime.AGENT_EMAIL,
  async authorize(token) {
    const ticket = await identity.verifyIdToken({ idToken: token, audience: runtime.SERVICE_URL });
    const payload = ticket.getPayload();
    return Boolean(payload?.email_verified && payload.email === runtime.CALLER_SERVICE_ACCOUNT);
  },
  services: getServices,
  async ready() { await pool.query('SELECT 1'); await getServices(); },
  async maintain() { await purgeExpiredRecords(pool);
  },
}));
server.requestTimeout = 910_000;
server.listen(Number(process.env.PORT ?? 8080), '0.0.0.0', () => console.log('Email agent listening'));
process.once('SIGTERM', () => {
  const deadline = setTimeout(() => { server.closeAllConnections(); void pool.end().finally(() => { process.exitCode = 1; }); }, 8_000);
  deadline.unref();
  server.close(() => { clearTimeout(deadline); void pool.end(); });
  server.closeIdleConnections();
});
