import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GmailClient, parseIncomingEmail } from '../src/gmail/client.js';
const mailbox='agent@example.com';
const encode=(value:string)=>Buffer.from(value).toString('base64url');
const mime=(headers:string='',body='Please send Exhibits for M12205.')=>`From: requester@example.com\r\n${headers ? headers+'\r\n' : ''}Content-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
const parse=(raw:string,agent=mailbox)=>parseIncomingEmail('synthetic-id','synthetic-thread',encode(raw),agent);
test('multipart MIME decodes text, subject and threading while excluding attachments',async()=>{
 const raw=await readFile(new URL('./fixtures/email/synthetic_multipart.eml',import.meta.url),'utf8');
 const result=await parse(raw); assert.ok(result);
 assert.equal(result.from,'requester@example.com'); assert.equal(result.subject,'Filing request — M12205');
 assert.match(result.text,/Café/); assert.doesNotMatch(result.text,/Attachment content|Alternative HTML/);
 assert.equal(result.messageId,'<synthetic-request@example.com>');
 assert.deepEqual(result.references,['<synthetic-parent@example.com>','<synthetic-root@example.com>']);
});
test('HTML-only mail becomes text and absent optional headers remain explicit',async()=>{
 const raw=await readFile(new URL('./fixtures/email/synthetic_html.eml',import.meta.url),'utf8');
 assert.match((await parse(raw))!.text,/Exhibits/);
 const result=await parse(mime()); assert.ok(result); assert.equal(result.subject,''); assert.equal(result.messageId,undefined); assert.deepEqual(result.references,[]);
});
test('missing, multiple, invalid and self-alias senders are ignored',async()=>{
 for(const from of ['', 'From: first@example.com, second@example.com','From: invalid','From: first@example.com\r\nFrom: second@example.com','From: Agent <agent@example.com>']) {
  assert.equal(await parse(`${from}\r\n\r\nSynthetic request`),null,from);
 }
 for(const from of ['a.gent+loop@gmail.com','AGENT@googlemail.com']) assert.equal(await parse(`From: ${from}\r\n\r\nSynthetic request`,'agent@gmail.com'),null);
});
test('automatic, mailing-list and FilingFetch-generated messages cannot trigger replies',async()=>{
 for(const header of ['Auto-Submitted: auto-replied','Auto-Submitted: auto-generated','List-Id: synthetic.example.com','X-Filing-Agent: filingfetch','Precedence: bulk','Precedence: list','Precedence: junk']) assert.equal(await parse(mime(header)),null,header);
 assert.ok(await parse(mime('Auto-Submitted: no')));
 for(const from of ['no-reply@example.com','noreply+test@example.com','do-not-reply@example.com','mailer-daemon@example.com','postmaster@example.com']) assert.equal(await parse(`From: ${from}\r\n\r\nSynthetic request`),null);
});
test('blank bodies, malformed raw encoding, missing IDs and actual oversized raw messages are ignored',async()=>{
 assert.equal(await parse(mime('','   ')),null);
 for(const raw of ['', 'not base64!', '====']) assert.equal(await parseIncomingEmail('id','thread',raw,mailbox),null);
 assert.equal(await parseIncomingEmail('','thread',encode(mime()),mailbox),null);
 assert.equal(await parseIncomingEmail('id','',encode(mime()),mailbox),null);
 assert.equal(await parse(mime('', 'x'.repeat(2_000_000))),null);
});
test('request fields are bounded without treating sender-controlled Reply-To as the requester',async()=>{
 const refs=Array.from({length:20},(_,i)=>`<synthetic-${i}@example.com>`);
 const result=await parse(mime(`Subject: ${'s'.repeat(600)}\r\nReferences: ${refs.join(' ')}\r\nReply-To: other@example.com`,'x'.repeat(21000)));
 assert.ok(result); assert.equal(result.subject.length,500); assert.equal(result.text.length,20000);
 assert.deepEqual(result.references,refs.slice(-15)); assert.equal(result.from,'requester@example.com');
});
function client(metadata:unknown,message:unknown) {
 const value=Object.create(GmailClient.prototype) as GmailClient; let calls=0;
 Object.defineProperty(value,'mailbox',{value:mailbox});
 value.request=async<T>()=> (++calls===1 ? metadata : message) as T;
 return {value,calls:()=>calls};
}
test('Gmail metadata blocks unsuitable labels and estimates before fetching raw content',async()=>{
 for(const label of ['SENT','DRAFT','SPAM','TRASH']) {
  const fake=client({labelIds:[label],sizeEstimate:100},{}); assert.equal(await fake.value.readIncoming('id'),null); assert.equal(fake.calls(),1);
 }
 for(const sizeEstimate of [undefined,NaN,Infinity,-1,0,1.5,2_000_001]) {
  const fake=client({sizeEstimate},{}); assert.equal(await fake.value.readIncoming('id'),null); assert.equal(fake.calls(),1);
 }
});
test('Gmail raw response requires requested identity and is checked independently of its estimate',async()=>{
 const good={id:'id',threadId:'thread',raw:encode(mime())};
 assert.ok(await client({labelIds:['INBOX'],sizeEstimate:100},good).value.readIncoming('id'));
 for(const message of [{...good,id:'other'},{...good,threadId:''},{...good,raw:encode(mime('', 'x'.repeat(2_000_000)))}]) assert.equal(await client({sizeEstimate:100},message).value.readIncoming('id'),null);
});
