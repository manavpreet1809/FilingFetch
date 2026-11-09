import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequestHandler } from '../src/http.js';
import { randomUUID } from 'node:crypto';
test('HTTP routes authenticate and validate before initializing providers',async()=>{
 const calls:string[]=[];let unavailable=false;
 const handler=createRequestHandler({mailbox:'agent@example.com',authorize:async token=>token==='synthetic-valid',services:async()=>{calls.push('services');if(unavailable)throw new Error('Synthetic failure');return {inbox:{sync:async()=>{calls.push('sync');},renewWatch:async()=>{calls.push('watch');}},jobs:{process:async()=>{calls.push('process');},dispatch:async()=>{calls.push('dispatch');}}};},maintain:async()=>{calls.push('maintain');},ready:async()=>{calls.push('ready');}});
 const server=createServer(handler);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
 const send=(path:string,body:unknown,token='synthetic-valid')=>fetch(base+path,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:typeof body==='string'?body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+'/health')).status,200);assert.equal((await fetch(base+'/ready')).status,401);
  assert.equal((await send('/process',{jobId:randomUUID()},'bad')).status,403);assert.equal((await send('/process',{jobId:'bad'})).status,400);assert.equal((await send('/process','{')).status,400);assert.deepEqual(calls,[]);
  assert.equal((await send('/process',{jobId:randomUUID()})).status,204);assert.deepEqual(calls.splice(0),['services','process']);
  assert.equal((await send('/inbox',{message:{data:Buffer.from(JSON.stringify({emailAddress:'foreign@example.com',historyId:'100'})).toString('base64')}})).status,204);assert.deepEqual(calls,[]);
  assert.equal((await send('/inbox',{message:{data:'!invalid'}})).status,400);
  assert.equal((await send('/inbox',{message:{data:Buffer.from(JSON.stringify({emailAddress:'agent@example.com',historyId:'100'})).toString('base64')}})).status,204);assert.deepEqual(calls.splice(0),['services','sync','dispatch']);
  assert.equal((await send('/maintain',{})).status,204);assert.deepEqual(calls.splice(0),['services','watch','sync','dispatch','maintain']);
  assert.equal((await send('/process','x'.repeat(100001))).status,413);
  unavailable=true;assert.equal((await send('/process',{jobId:randomUUID()})).status,503);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
