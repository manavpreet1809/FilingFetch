import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractRequest, type FieldExtractor } from '../src/gmail/extract.js';
const fields={status:'ready',matterNumber:'M12205',documentType:'Exhibits',limit:null} as const;
const infer=(overrides:Record<string,unknown>={}):FieldExtractor=>async()=>({...fields,...overrides}) as Awaited<ReturnType<FieldExtractor>>;
test('grounded extraction accepts source fields and explicit counts, including capped counts',async()=>{
 for(const [text,limit] of [['Send 2 Exhibits for M12205',2],['Send 99 files of Exhibits for M12205',10],['Exhibit for m12205',10]] as const){
  const r=await extractRequest({subject:'',text},infer());assert.deepEqual(r.request,{matterNumber:'M12205',documentType:'Exhibits',limit});
 }
});
test('invented identifiers, categories and counts cannot authorize retrieval',async()=>{
 for(const [text,overrides] of [['Exhibits please',{}],['M12205 please',{}],['M12205 Recordings',{documentType:'Exhibits'}],['M12205 Exhibits',{limit:4}]] as const){
  const r=await extractRequest({subject:'',text},infer(overrides));
  // An explicit category overrides a conflicting model category, but absent evidence must fail.
  if(text==='M12205 Recordings') assert.equal(r.request?.documentType,'Recordings'); else assert.equal(r.request,null);
 }
});
test('zero, negative and malformed requests clarify without guessing',async()=>{
 for(const text of ['Send 0 Exhibits for M12205','Send -2 Exhibits for M12205','M12205 Exhibits -2 files','Exhibits M123']) assert.equal((await extractRequest({subject:'',text},infer())).request,null);
 const other=await extractRequest({subject:'',text:'Other M12205'},infer({documentType:'Other Documents'}));assert.equal(other.request?.documentType,'Other Documents');
});
test('multiple requests and conflicting subject stop before model inference',async()=>{
 for(const email of [{subject:'M12206',text:'Exhibits M12205'},{subject:'',text:'Exhibits and Recordings M12205'}]){
  let calls=0;const r=await extractRequest(email,async()=>{calls++;return {...fields};});assert.equal(r.request,null);assert.equal(calls,0);
 }
});
test('quoted history and signatures do not supply request fields',async()=>{
 for(const text of ['Please help\n> M12205 Exhibits','Please help\nOn Monday Someone wrote:\nM12205 Exhibits','Please help\n--\nM12205 Exhibits']){
  let body='';const r=await extractRequest({subject:'',text},async input=>{body=input.body;return {...fields};});assert.equal(r.request,null);assert.doesNotMatch(body,/M12205/);
 }
});
test('model refusal produces clarification rather than an invented request',async()=>{
 assert.equal((await extractRequest({subject:'',text:'Please help'},async()=>null)).request,null);
});
