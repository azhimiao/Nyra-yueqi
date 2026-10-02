import test from 'node:test';
import assert from 'node:assert/strict';
import { __setConversationStorageForTests, getSession } from './store.js';
import { __setSessionMapStorageForTests } from '../context/session-map.js';
import { writeCompanionTurn } from './companion-write.js';
import { captureRegenerationTarget, validateRegenerationTarget } from './regeneration-target.js';
import { createPendingTurnBuckets, freezeTurnExecutionScope, resolveReplyExecutionScope } from './turn-scope.js';
import { editMessageContent } from './runtime.js';
const init=()=>{const m=new Map();const st={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};__setConversationStorageForTests(st);__setSessionMapStorageForTests(st);};
const base={companionId:'fixture',chatSessionId:'char:fixture'};
test('second user bucket survives first take and each scope remains isolated',()=>{
 const q=createPendingTurnBuckets();const a=freezeTurnExecutionScope({characterId:'a',sessionId:'a'}),b=freezeTurnExecutionScope({characterId:'b',sessionId:'b'});
 q.buffer(a,{userText:'first',userMessageId:'u1'});assert.equal(resolveReplyExecutionScope(q,a).taken.userMessageId,'u1');
 q.buffer(a,{userText:'second',userMessageId:'u2'});q.buffer(b,{userText:'other',userMessageId:'u3'});
 assert.equal(resolveReplyExecutionScope(q,a).taken.userMessageId,'u2');assert.equal(q.size(),1);assert.equal(resolveReplyExecutionScope(q,b).taken.userMessageId,'u3');
});
test('regeneration retains old answer until one guarded success and keeps metadata',async()=>{
 init();await writeCompanionTurn({...base,role:'user',text:'我的灯',messageId:'u'});
 const first=await writeCompanionTurn({...base,role:'assistant',text:'旧答复',messageId:'a'});
 const sid=first.conversationSessionId;const capture=captureRegenerationTarget(sid,{id:'a'});assert.equal(capture.ok,true);
 assert.equal(getSession(sid).messageNodes[first.node.id].candidates.length,1);
 const meta={characterAffect:{version:1,feeling:'平静'},turnActivity:{state:'complete'}};
 const next=await writeCompanionTurn({...base,role:'assistant',text:'新答复',messageId:'a',regenerationTarget:capture.target,meta});
 assert.equal(next.ok,true);assert.equal(next.node.candidates.length,2);assert.equal(next.node.candidates[0].content,'旧答复');assert.deepEqual(next.turn.meta.characterAffect,meta.characterAffect);
 assert.equal(validateRegenerationTarget(capture.target).ok,false);
 const duplicate=await writeCompanionTurn({...base,role:'assistant',text:'重复',messageId:'a',regenerationTarget:capture.target});assert.equal(duplicate.ok,false);assert.equal(getSession(sid).messageNodes[first.node.id].candidates.length,2);
});
test('new user/edit/deletion during regeneration invalidates target',async()=>{
 init();const user=await writeCompanionTurn({...base,role:'user',text:'旧问题'});const first=await writeCompanionTurn({...base,role:'assistant',text:'旧答复',messageId:'a'});
 let t=captureRegenerationTarget(first.conversationSessionId,{id:'a'}).target;
 editMessageContent(first.conversationSessionId,user.node.id,'改过的问题');assert.equal(validateRegenerationTarget(t).ok,false);
 init();await writeCompanionTurn({...base,role:'user',text:'原问题'});const second=await writeCompanionTurn({...base,role:'assistant',text:'旧答复',messageId:'a'});
 t=captureRegenerationTarget(second.conversationSessionId,{id:'a'}).target;
 await writeCompanionTurn({...base,role:'user',text:'新问题'});assert.equal(validateRegenerationTarget(t).ok,false);
});
test('projection failure is committed V2 success, never fake failure or second candidate',async()=>{
 init();const r=await writeCompanionTurn({...base,role:'assistant',text:'已提交',messageId:'a',saveChatMessage:()=>{throw Error('fixture disk full');}});
 assert.equal(r.ok,true);assert.equal(r.projected,false);assert.equal(r.projectionPending,true);assert.equal(getSession(r.conversationSessionId).messageNodes[r.node.id].candidates.length,1);
});
