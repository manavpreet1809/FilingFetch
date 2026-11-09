import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { Inbox } from '../src/gmail/inbox.js';
import { GmailClient, GmailError } from '../src/gmail/client.js';
function fixture(pages: unknown[], cursor='100') {
 const calls:string[]=[]; const statements:{sql:string;values:unknown[]}[]=[];let released=false;
 const client={async query(sql:string,values:unknown[]=[]){statements.push({sql,values});return {rows:sql.startsWith('SELECT history_id')?[{history_id:cursor,updated_at:new Date('2026-11-01T00:00:00Z')}]:[],rowCount:1};},release(){released=true;}};
 const pool={connect:async()=>client} as unknown as Pool;
 const gmail={mailbox:'agent@example.com',async request(path:string){calls.push(path);const value=pages.shift();if(value instanceof Error)throw value;if(value===undefined)throw new Error('Unexpected Gmail call');return value;}} as unknown as GmailClient;
 return {inbox:new Inbox(pool,gmail),calls,statements,released:()=>released};
}
const message={id:'synthetic',threadId:'thread',labelIds:['INBOX']};
test('history paging preserves starting cursor and commits only after all insertions',async()=>{
 const f=fixture([{history:[{messagesAdded:[{message}]}],historyId:'110',nextPageToken:'two'},{history:[{messagesAdded:[{message}]}],historyId:'120'}]);
 await f.inbox.sync();assert.equal(f.calls.length,2);
 for(const path of f.calls){const q=new URLSearchParams(path.split('?')[1]);assert.equal(q.get('startHistoryId'),'100');assert.equal(q.get('labelId'),'INBOX');}
 assert.ok(f.statements.filter(s=>s.sql.includes('INSERT INTO jobs')).every(s=>s.sql.includes('ON CONFLICT (mailbox, gmail_message_id) DO NOTHING')));
 assert.deepEqual(f.statements.find(s=>s.sql.startsWith('UPDATE mailbox_cursors'))!.values,['agent@example.com','120']);
 assert.equal(f.statements.at(-1)!.sql,'COMMIT');assert.equal(f.released(),true);
});
test('expired history captures a new cursor before paged inbox recovery',async()=>{
 const f=fixture([new GmailError(404),{historyId:'200'},{messages:[message],nextPageToken:'next'},{messages:[]}]);await f.inbox.sync();
 assert.equal(f.calls[1],'profile');assert.match(f.calls[2]!,/^messages\?/);
 const q=new URLSearchParams(f.calls[2]!.split('?')[1]);assert.equal(q.get('q'),'in:inbox after:1793491140');
 assert.equal(f.statements.find(s=>s.sql.startsWith('UPDATE mailbox_cursors'))!.values[1],'200');
});
test('page failure, repeated tokens and regressing cursors roll back and release the lock',async()=>{
 for(const pages of [[new GmailError(503)],[{historyId:'110',nextPageToken:'same'},{historyId:'120',nextPageToken:'same'}],[{historyId:'99'}],[{historyId:'invalid'}]]){
  const f=fixture(pages);await assert.rejects(f.inbox.sync());assert.equal(f.statements.at(-1)!.sql,'ROLLBACK');assert.equal(f.released(),true);assert.equal(f.statements.some(s=>s.sql.startsWith('UPDATE mailbox_cursors')),false);
 }
});
test('blocked labels are skipped and malformed message identity fails the transaction',async()=>{
 const f=fixture([{historyId:'110',history:[{messagesAdded:[{message:{...message,labelIds:['SENT']}}]}]}]);await f.inbox.sync();assert.equal(f.statements.some(s=>s.sql.includes('INSERT INTO jobs')),false);
 const bad=fixture([{historyId:'110',history:[{messagesAdded:[{message:{id:'',threadId:'thread'}}]}]}]);await assert.rejects(bad.inbox.sync(),/identity/);assert.equal(bad.statements.at(-1)!.sql,'ROLLBACK');
});
