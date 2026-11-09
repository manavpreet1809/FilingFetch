import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { canonicalEmail } from './gmail/client.js';

interface Services {
  inbox: { sync(): Promise<void>; renewWatch(): Promise<void> };
  jobs: { process(id: string): Promise<unknown>; dispatch(): Promise<unknown> };
}
interface HandlerDependencies {
  mailbox: string;
  authorize(token: string): Promise<boolean>;
  services(): Promise<Services>;
  maintain(): Promise<void>;
  ready(): Promise<void>;
}

/** Validate authentication and payloads before initializing external services. */
export function createRequestHandler(dependencies: HandlerDependencies) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      if (request.method === 'GET' && request.url === '/health') { response.writeHead(200).end('ok'); return; }
      const ready = request.method === 'GET' && request.url === '/ready';
      if (!ready && (request.method !== 'POST' || !['/inbox', '/process', '/maintain'].includes(request.url ?? ''))) { response.writeHead(404).end(); return; }
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) { response.writeHead(401).end(); return; }
      try { if (!await dependencies.authorize(token)) { response.writeHead(403).end(); return; } }
      catch { response.writeHead(401).end(); return; }
      if (ready) { await dependencies.ready(); response.writeHead(200).end('ready'); return; }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 100_000) { response.writeHead(413).end(); request.resume(); return; }
        chunks.push(chunk);
      }
      let body: unknown;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { response.writeHead(400).end(); return; }
      if (request.url === '/process') {
        const input = z.object({ jobId: z.string().uuid() }).strict().safeParse(body);
        if (!input.success) { response.writeHead(400).end(); return; }
        await (await dependencies.services()).jobs.process(input.data.jobId);
      } else if (request.url === '/inbox') {
        const input = z.object({ message: z.object({ data: z.string().min(1).regex(/^[A-Za-z0-9+/]+={0,2}$/) }) }).safeParse(body);
        if (!input.success) { response.writeHead(400).end(); return; }
        let notification: unknown;
        try { notification = JSON.parse(Buffer.from(input.data.message.data, 'base64').toString()); } catch { response.writeHead(400).end(); return; }
        const parsed = z.object({ emailAddress: z.string().email(), historyId: z.string().regex(/^\d+$/) }).safeParse(notification);
        if (!parsed.success) { response.writeHead(400).end(); return; }
        if (canonicalEmail(parsed.data.emailAddress) !== canonicalEmail(dependencies.mailbox)) { response.writeHead(204).end(); return; }
        const {inbox,jobs} = await dependencies.services(); await inbox.sync(); await jobs.dispatch();
      } else {
        if (!z.object({}).strict().safeParse(body).success) { response.writeHead(400).end(); return; }
        const {inbox,jobs} = await dependencies.services(); await inbox.renewWatch(); await inbox.sync(); await jobs.dispatch(); await dependencies.maintain();
      }
      response.writeHead(204).end();
    } catch (error) {
      console.error(JSON.stringify({event:'request_failed',route:request.url,type:error instanceof Error?error.name:'Error'}));
      if (!response.headersSent) response.writeHead(503).end('Temporary processing failure'); else response.end();
    }
  };
}
