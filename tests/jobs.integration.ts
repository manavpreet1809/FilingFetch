import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { simpleParser } from 'mailparser';
import { Inbox } from '../src/gmail/inbox.js';
import { purgeExpiredRecords } from '../src/maintenance.js';
import { JobRunner } from '../src/jobs.js';
import { GmailClient, GmailError } from '../src/gmail/client.js';
import { readConfig } from '../src/config.js';
import { validateFile } from '../src/files/validate.js';
import { DOCUMENT_TYPES } from '../src/domain.js';
import type { fetchDocuments } from '../src/fetch.js';
const url=new URL(process.env.TEST_DATABASE_URL ?? 'http://missing');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/filingfetch_test')) throw new Error('TEST_DATABASE_URL must identify a localhost filingfetch_test database');
const mailbox='agent@example.com';
const incoming={id:'synthetic',threadId:'thread',from:'requester@example.com',subject:'Exhibits M12205',text:'Please send Exhibits for M12205',messageId:'<synthetic@example.com>',references:[]};
const request={matterNumber:'M12205',documentType:'Exhibits',limit:1} as const;
const config=readConfig({CACHE_BACKEND:'off'});
const retrieve:typeof fetchDocuments=async(req,_config,directory)=>{
 const {mkdir}=await import('node:fs/promises');await mkdir(directory,{recursive:true});const path=join(directory,'synthetic.txt');await writeFile(path,'Synthetic public filing');
 return {request:req,matter:{number:req.matterNumber,title:'Synthetic matter',status:'Closed',type:null,category:null,receivedDate:null,finalSubmissionDate:null,outcome:null,counts:Object.fromEntries(DOCUMENT_TYPES.map(t=>[t,t===req.documentType?1:0])) as any,totalDocuments:1,retrievedAt:new Date().toISOString(),sourceUrl:'https://example.invalid/synthetic'},files:[{...await validateFile(path,'synthetic.txt',1000),documentId:'1',documentTitle:'Synthetic',originalFilename:'synthetic.txt',downloadedAt:new Date().toISOString(),cacheHit:false}],skipped:[],warnings:[],listingExhausted:true};
};
test('PostgreSQL job lifecycle, concurrency, dispatch and delivery reconciliation',async t=>{
 const admin=new Pool({connectionString:url.toString()});const schema=`test_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE SCHEMA ${schema}`);const pool=new Pool({connectionString:url.toString(),options:`-c search_path=${schema}`,max:6});
 try{
  for(const file of ['001_initial.sql','002_email_jobs.sql'])await pool.query(await readFile(`migrations/${file}`,'utf8'));
  let sends=0;let raws:string[]=[];let sendError:Error|undefined;let found:string|undefined;
  const gmail=Object.create(GmailClient.prototype) as GmailClient;Object.defineProperty(gmail,'mailbox',{value:mailbox});
  gmail.readIncoming=async()=>({...incoming});gmail.send=async(raw)=>{sends++;raws.push(raw);if(sendError)throw sendError;return {id:'outgoing'};};gmail.findReply=async()=>found;
  const tasks={createTask:async()=>[{}]} as any;
  const runner=new JobRunner(pool,gmail,config,{tasks,retrieve,extract:async()=>({request,issues:[]})});
  const add=async(status='pending',extra:Record<string,unknown>={})=>{const id=randomUUID();await pool.query('INSERT INTO jobs(id,mailbox,gmail_message_id,gmail_thread_id,status) VALUES($1,$2,$3,$4,$5)',[id,mailbox,id,'thread',status]);for(const [key,value]of Object.entries(extra)){assert.ok(['reply_message_id','reply_status','mailbox','lease_owner','lease_expires_at'].includes(key));await pool.query(`UPDATE jobs SET ${key}=$2 WHERE id=$1`,[id,value]);}return id;};
  const row=async(id:string)=>(await pool.query('SELECT * FROM jobs WHERE id=$1',[id])).rows[0];
  await t.test('history sync commits duplicate-safe inserts and rolls back failed pages in PostgreSQL',async()=>{
   await pool.query('INSERT INTO mailbox_cursors(mailbox,history_id) VALUES($1,$2)',[mailbox,'100']);
   let pages:any[]=[{historyId:'110',history:[{messagesAdded:[{message:{id:'history-message',threadId:'thread'}}]}],nextPageToken:'two'},{historyId:'120',history:[{messagesAdded:[{message:{id:'history-message',threadId:'thread'}}]}]}];
   const historyGmail={mailbox,request:async()=>{const next=pages.shift();if(next instanceof Error)throw next;return next;}} as unknown as GmailClient;
   const inbox=new Inbox(pool,historyGmail);await inbox.sync();assert.equal((await pool.query('SELECT count(*) FROM jobs WHERE gmail_message_id=$1',['history-message'])).rows[0].count,'1');
   pages=[{historyId:'130',history:[{messagesAdded:[{message:{id:'rolled-back',threadId:'thread'}}]}],nextPageToken:'failure'},new Error('Synthetic page failure')];
   await assert.rejects(inbox.sync());assert.equal((await pool.query('SELECT count(*) FROM jobs WHERE gmail_message_id=$1',['rolled-back'])).rows[0].count,'0');assert.equal((await pool.query('SELECT history_id FROM mailbox_cursors WHERE mailbox=$1',[mailbox])).rows[0].history_id,'120');
   await pool.query("UPDATE jobs SET status='completed' WHERE gmail_message_id='history-message'");
  });
  await t.test('retrieval packages validated files and sends threaded MIME once',async()=>{
   const id=await add();await runner.process(id);const job=await row(id);assert.equal(job.status,'completed');assert.equal(job.lease_owner,null);assert.equal(job.attempts,1);assert.equal(job.outgoing_message_id,'outgoing');assert.equal(job.result.files[0].path,undefined);
   const parsed=await simpleParser(Buffer.from(raws.at(-1)!,'base64url'));assert.equal(parsed.inReplyTo,incoming.messageId);assert.equal(parsed.attachments.length,1);assert.equal(parsed.attachments[0]!.contentType,'application/zip');assert.equal(parsed.headers.get('x-filing-agent'),'filingfetch');
   const before=sends;await runner.process(id);assert.equal(sends,before);
  });
  await t.test('clarification sends no attachment and commits its terminal status',async()=>{
   const id=await add();const clarify=new JobRunner(pool,gmail,config,{tasks,extract:async()=>({request:null,issues:['Missing matter number. Include M12205.']})});await clarify.process(id);assert.equal((await row(id)).status,'needs_clarification');assert.equal((await simpleParser(Buffer.from(raws.at(-1)!,'base64url'))).attachments.length,0);
  });
  await t.test('concurrent claims allow one worker; a different mailbox cannot claim the job',async()=>{
   const id=await add();let entered!:()=>void;const enteredPromise=new Promise<void>(r=>entered=r);let resume!:()=>void;const hold=new Promise<void>(r=>resume=r);
   const blocked=new JobRunner(pool,gmail,config,{tasks,retrieve,extract:async()=>{entered();await hold;return {request,issues:[]};}});
   const first=blocked.process(id);await enteredPromise;await runner.process(id);assert.equal((await row(id)).attempts,1);resume();await first;
   const foreign=await add('pending',{mailbox:'different@example.com'});await runner.process(foreign);assert.equal((await row(foreign)).attempts,0);
  });
  await t.test('uncertain sends remain sending until Sent reconciliation, with no blind resend',async()=>{
   const id=await add();sendError=new Error('Synthetic interrupted send');await assert.rejects(runner.process(id));sendError=undefined;assert.equal((await row(id)).status,'sending');const before=sends;
   await runner.process(id);assert.equal(sends,before);assert.match((await row(id)).last_error,/Delivery uncertain/);
   found='confirmed-outgoing';await runner.process(id);found=undefined;assert.equal((await row(id)).status,'completed');assert.equal((await row(id)).outgoing_message_id,'confirmed-outgoing');assert.equal(sends,before);
  });
  await t.test('duplicate incoming IDs are constrained and expired leases can recover',async()=>{
   const id=await add('pending',{lease_owner:randomUUID()});await pool.query("UPDATE jobs SET lease_expires_at=now()-interval '1 minute' WHERE id=$1",[id]);await runner.process(id);assert.equal((await row(id)).status,'completed');
   await assert.rejects(pool.query('INSERT INTO jobs(id,mailbox,gmail_message_id) VALUES($1,$2,$3)',[randomUUID(),mailbox,id]),(error:any)=>error.code==='23505');
  });
  await t.test('repeated retrieval failures terminate with one attachment-free failure reply',async()=>{
   const id=await add();const failing=new JobRunner(pool,gmail,config,{tasks,extract:async()=>({request,issues:[]}),retrieve:async()=>{throw new Error('Synthetic source failure');}});
   for(let attempt=0;attempt<3;attempt++)await assert.rejects(failing.process(id));await failing.process(id);assert.equal((await row(id)).status,'failed');assert.equal((await row(id)).attempts,4);assert.equal((await simpleParser(Buffer.from(raws.at(-1)!,'base64url'))).attachments.length,0);
  });
  await t.test('persistent pre-send provider errors stop after four attempts without sending',async()=>{
   const id=await add();const original=gmail.readIncoming;const before=sends;
   gmail.readIncoming=async()=>{throw new GmailError(503);};
   try{for(let attempt=0;attempt<4;attempt++)await assert.rejects(runner.process(id));assert.equal((await row(id)).status,'failed');await runner.process(id);assert.equal((await row(id)).attempts,4);assert.equal(sends,before);}finally{gmail.readIncoming=original;}
  });
  await t.test('retention removes old terminal records but preserves uncertain delivery and active work',async()=>{
   const terminal=await add('completed');const uncertain=await add('sending');const active=await add();
   await pool.query("UPDATE jobs SET updated_at=now()-interval '31 days' WHERE id=ANY($1::uuid[])",[[terminal,uncertain,active]]);await purgeExpiredRecords(pool);
   assert.equal(await row(terminal),undefined);assert.equal((await row(uncertain)).status,'sending');assert.equal((await row(active)).status,'pending');
   await pool.query("UPDATE jobs SET status='completed' WHERE id=ANY($1::uuid[])",[[uncertain,active]]);
  });
  await t.test('dispatch creates versioned authenticated tasks and releases a failed enqueue',async()=>{
   await pool.query("UPDATE jobs SET status='completed' WHERE status='pending'");const id=await add();const saved={...process.env};process.env.SERVICE_URL='https://example.invalid';process.env.TASK_QUEUE='projects/synthetic/locations/test/queues/test';process.env.CALLER_SERVICE_ACCOUNT='caller@example.com';
   try{let captured:any;const dispatch=new JobRunner(pool,gmail,config,{tasks:{createTask:async(input:any)=>{captured=input;return [{}];}} as any});await dispatch.dispatch();assert.match(captured.task.name,new RegExp(`${id}-1$`));assert.equal(captured.task.httpRequest.oidcToken.audience,'https://example.invalid');assert.equal((await row(id)).dispatch_version,1);
    await pool.query('UPDATE jobs SET queued_at=NULL WHERE id=$1',[id]);const failing=new JobRunner(pool,gmail,config,{tasks:{createTask:async()=>{throw new Error('Synthetic enqueue error');}} as any});await assert.rejects(failing.dispatch());assert.equal((await row(id)).queued_at,null);
   }finally{for(const key of ['SERVICE_URL','TASK_QUEUE','CALLER_SERVICE_ACCOUNT']){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
  });
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
