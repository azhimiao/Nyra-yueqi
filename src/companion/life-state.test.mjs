import test from 'node:test';
import assert from 'node:assert/strict';
import {__setLifeStateStorageForTests,saveLifeState,getLifeState,createEmptyLifeState} from './life-state.js';
test('existing life planner records and completed projection receipts survive save/reload per character',()=>{
 const m=new Map();__setLifeStateStorageForTests({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)});
 const row={id:'event-1',status:'completed',evidenceRefs:['user-1'],projection:{diaryId:'diary-1'}};
 saveLifeState('a',{recentLifeEvents:[row],unresolvedThoughts:[row],intents:[row],projects:[{id:'project-1',status:'active'}]});
 const loaded=getLifeState('a');for(const key of ['recentLifeEvents','unresolvedThoughts','intents'])assert.deepEqual(loaded[key],[row]);assert.equal(loaded.projects[0].id,'project-1');assert.deepEqual(getLifeState('b').recentLifeEvents,[]);
 const bounded=createEmptyLifeState({recentLifeEvents:Array.from({length:70},(_,id)=>({id})),intents:Array.from({length:25},(_,id)=>({id})),projects:[null,'invalid',{id:'kept'}]});
 assert.equal(bounded.recentLifeEvents.length,40);assert.equal(bounded.intents.length,20);assert.deepEqual(bounded.projects,[{id:'kept'}]);
});
