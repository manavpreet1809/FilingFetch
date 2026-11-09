import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simpleParser } from 'mailparser';
import { GmailClient } from '../src/gmail/client.js';
import { clarification } from '../src/gmail/reply.js';
test('clarifications identify only missing fields and escape hostile HTML',()=>{
 const message=clarification(['Missing matter number. Include M12205.']);assert.match(message.text,/Matter number/);assert.doesNotMatch(message.text,/Valid document type:/);
 const hostile=clarification(['<script>alert(1)</script>']);assert.doesNotMatch(hostile.html,/<script>/);assert.match(hostile.html,/&lt;script&gt;/);
});
test('outgoing MIME preserves recipient, headers and plain/HTML alternatives without sending',async()=>{
 const gmail=Object.create(GmailClient.prototype) as GmailClient;Object.defineProperty(gmail,'mailbox',{value:'agent@example.com'});
 const email={id:'synthetic',threadId:'thread',from:'requester@example.com',subject:'Re: Synthetic',text:'',messageId:'<parent@example.com>',references:['<root@example.com>']};
 const raw=await gmail.composeReply(email,clarification(['Missing matter number.']),'<reply@example.com>');const parsed=await simpleParser(Buffer.from(raw,'base64url'));
 assert.equal(parsed.subject,'Re: Synthetic');assert.equal(parsed.to && !Array.isArray(parsed.to) ? parsed.to.value[0]!.address : '',email.from);
 assert.equal(parsed.inReplyTo,email.messageId);assert.deepEqual(parsed.references,['<root@example.com>',email.messageId]);assert.equal(parsed.headers.get('auto-submitted'),'auto-replied');assert.equal(parsed.headers.get('x-filing-agent'),'filingfetch');assert.equal(parsed.attachments.length,0);assert.ok(parsed.html);assert.match(parsed.text!,/Matter number/);
});
