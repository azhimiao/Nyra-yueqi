import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeModelStream, withModelDeadline } from './stream-protocol.js';
import { isolatePrivateReasoning } from './private-reasoning.js';
import { hostedThinkingOptions } from '../../server/model-thinking-policy.mjs';
const event = p => `data: ${JSON.stringify(p)}\r\n\r\n`;
const delta = (content, finish_reason=null) => ({choices:[{delta:{content},finish_reason}]});
const stream = (text, bytewise=false) => new Response(new ReadableStream({start(c){const b=new TextEncoder().encode(text);for(const x of bytewise ? [...b].map(v=>new Uint8Array([v])) : [b]) c.enqueue(x);c.close();}}));

test('UTF8 byte boundaries, CRLF, usage after DONE and finish-only terminals', async () => {
 const content='你好，月亮🌙。';
 for(const ending of ['data: [DONE]\r\n\r\n',event(delta('', 'stop'))]) {
  const r=await consumeModelStream(stream(event(delta(content))+ending+event({usage:{total_tokens:34}}),true));
  assert.equal(r.content,content); assert.equal(r.usage.total_tokens,34);
 }
});
test('rejects EOF, error payload/event, malformed frame, truncated/filter and incomplete tools', async () => {
 const cases=[
  [event(delta('partial')),'MODEL_STREAM_INCOMPLETE'],
  [event(delta('partial'))+event({error:{message:'secret should not escape'}}),'MODEL_STREAM_ERROR'],
  ['event: error\ndata: {"message":"secret"}\n\n','MODEL_STREAM_ERROR'],
  ['data: {broken}\n\n','MODEL_STREAM_MALFORMED'],
  [event(delta('partial','length'))+'data: [DONE]\n\n','MODEL_OUTPUT_TRUNCATED'],
  [event(delta('partial','content_filter')),'MODEL_OUTPUT_FILTERED'],
  [event({choices:[{delta:{tool_calls:[{index:0,function:{name:'tool',arguments:'{"a"'}}]},finish_reason:'tool_calls'}]}),'MODEL_TOOL_CALL_INCOMPLETE'],
 ];
 for(const [body,code] of cases) await assert.rejects(consumeModelStream(stream(body)),e=>e.code===code&&!e.message.includes('secret'));
});
test('private reasoning: every split remains isolated, nested and uppercase variants', () => {
 for(const raw of ['<think>PRIVATE</think>你好','hello <THINKING>PRIVATE</THINKING> world','<think>PRIVATE<think>PRIVATE</think>PRIVATE</think>正文']) {
  for(let i=1;i<=raw.length;i++) {const p=isolatePrivateReasoning(raw.slice(0,i),{streaming:true});assert.ok(!/PRIVATE|<\/?(?:think|THINK)/.test(p.text), `${i}:${p.text}`);}
  assert.equal(isolatePrivateReasoning(raw).complete,true);
 }
 assert.equal(isolatePrivateReasoning('<think>unfinished').complete,false);
 assert.equal(isolatePrivateReasoning('1 < 2 and 3 > 2').text,'1 < 2 and 3 > 2');
});
test('native reasoning never reaches content callback or returned raw fields', async () => {
 const seen=[];
 const r=await consumeModelStream(stream(event({choices:[{delta:{reasoning_content:'SYNTHETIC_PRIVATE'}}]})+event(delta('公开','stop'))),{onReasoning:x=>seen.push(x)});
 assert.equal(r.content,'公开'); assert.equal(r.reasoningLength,17); assert.deepEqual(Object.keys(seen[0]).sort(),['length','phase']);
 assert.ok(!JSON.stringify(r).includes('SYNTHETIC_PRIVATE'));
});
test('deadline covers stalled body and cancel remains prompt even stalled reader.cancel', async () => {
 const stall=()=>new Response(new ReadableStream({start(){},cancel(){return new Promise(()=>{});}}));
 const t=Date.now();
 await assert.rejects(withModelDeadline(signal=>consumeModelStream(stall(),{signal}),{timeoutMs:25}),{name:'TimeoutError'});
 assert.ok(Date.now()-t<700);
 const controller=new AbortController();
 const pending=withModelDeadline(signal=>consumeModelStream(stall(),{signal}),{signal:controller.signal,timeoutMs:1000});
 controller.abort(); await assert.rejects(pending,{name:'AbortError'});
});
test('hosted thinking policy matches only configured family and companion purpose',()=>{
 const base={managed:true,model:'doubao-seed-2-1-260915',businessPurpose:'chat.companion_reply',env:{}};
 assert.deepEqual(hostedThinkingOptions(base),{thinking:{type:'disabled'}});
 assert.deepEqual(hostedThinkingOptions({...base,managed:false}),{});
 assert.deepEqual(hostedThinkingOptions({...base,model:'unknown'}),{});
 assert.deepEqual(hostedThinkingOptions({...base,businessPurpose:'memory.extract'}),{});
 assert.deepEqual(hostedThinkingOptions({...base,env:{YUEQI_COMPANION_THINKING:'preserve'}}),{});
 assert.deepEqual(hostedThinkingOptions({...base,env:{YUEQI_COMPANION_THINKING:'enabled'}}),{thinking:{type:'enabled'}});
});
