/** Real local gateway + synthetic upstream; no external model or real account. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp,writeFile,mkdir,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyAccountStore,createAccountStore } from '../server/account-store.mjs';
import { createBillingService } from '../server/billing/service.mjs';
import { issueSession } from '../server/auth/auth-core.mjs';
const out=join(process.cwd(),'docs/qa/dialogue-repair');await mkdir(out,{recursive:true});
const dir=await mkdtemp(join(tmpdir(),'nyra-stream-fault-')),dataFile=join(dir,'accounts.json'),secret=randomUUID(),userId='synthetic-stream-repair';
const store=emptyAccountStore();store.users[userId]={id:userId,username:userId,modelSource:'hosted',hostedTier:'standard',createdAt:new Date().toISOString()};
const {token}=issueSession({sessions:store.sessions,userId,secret,ttlMs:3600000});await writeFile(dataFile,JSON.stringify(store));
await createBillingService(createAccountStore(dataFile)).grantCredits({userId,credits:100000,source:'isolated_test',referenceId:randomUUID(),type:'bonus'});
let bodySpec='',delay=0;const upstreamBodies=[],results=[];
const upstream=createServer(async(req,res)=>{let raw='';for await(const x of req)raw+=x;upstreamBodies.push(JSON.parse(raw));res.writeHead(200,{'content-type':'text/event-stream'});res.write(bodySpec);if(delay)await new Promise(r=>setTimeout(r,delay));res.end();});await new Promise(r=>upstream.listen(5248,'127.0.0.1',r));
const child=spawn(process.execPath,['server/index.mjs'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,ARK_API_KEY:'synthetic-no-credential',ARK_BASE_URL:'http://127.0.0.1:5248/v1',YUEQI_MODEL_API_KEY:'',PORT:'5247',HOST:'127.0.0.1',YUEQI_PUBLIC_SERVER:'0',YUEQI_BILLING_DRIVER:'',YUEQI_BILLING_DATABASE_URL:'',YUEQI_DATA_FILE:dataFile,YUEQI_ECONOMY_DATA_FILE:join(dir,'economy.json'),YUEQI_LOCAL_TOKEN_FILE:join(dir,'token'),YUEQI_UPDATE_MANIFEST_FILE:join(dir,'updates.json'),YUEQI_NOTICES_FILE:join(dir,'notices.json'),YUEQI_AUTH_SECRET:secret}});
child.stdout.on('data',()=>{});child.stderr.on('data',()=>{});
const ev=p=>`data: ${JSON.stringify(p)}\n\n`,delta=(text,finish_reason)=>({choices:[{delta:{content:text},finish_reason}]});
const request=(signal)=>fetch('http://127.0.0.1:5247/model/chat',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'仅测试本地流'}],stream:true,maxTokens:100,businessPurpose:'chat.companion_reply',capability:'chat',modelExecutionId:`fixture-${randomUUID()}`}),signal});
try{
 let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch('http://127.0.0.1:5247/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,200));}assert.equal(ready,true);
 for(const [name,body,success] of [
  ['DONE with usage trailer',ev(delta('完整答复'))+'data: [DONE]\n\n'+ev({usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}),true],
  ['finish_reason stop without DONE',ev(delta('完整答复','stop'))+ev({usage:{prompt_tokens:20,completion_tokens:10,total_tokens:30}}),true],
  ['EOF after partial',ev(delta('未完成半句')),false],
  ['error SSE after partial',ev(delta('未完成半句'))+'event: error\ndata: {"message":"synthetic failure"}\n\n',false],
  ['length finish',ev(delta('被截断','length'))+'data: [DONE]\n\n',false],
 ]){
  bodySpec=body;const response=await request(AbortSignal.timeout(8000));assert.equal(response.status,200);const output=await response.text();
  assert.equal(output.includes('data: [DONE]'),success,name);assert.equal(output.includes('"error"'),!success,name);if(success){assert.ok(output.includes('"billing"'));assert.ok(output.includes('"total_tokens":30'));}
  const db=JSON.parse(await readFile(dataFile,'utf8'));const billing=await createBillingService(createAccountStore(dataFile)).getSummary(userId);
  assert.equal(billing.reserved,0);assert.deepEqual(upstreamBodies.at(-1).thinking,{type:'disabled'});
  results.push({name,pass:true,done:success,error:!success,reserved:billing.reserved,usageTrailerPreserved:success,hostedThinkingDisabled:true});console.log(JSON.stringify(results.at(-1)));
 }
 bodySpec=ev(delta('连接取消测试'));delay=2000;const c=new AbortController();const response=await request(c.signal);await response.body.getReader().read();c.abort();await new Promise(r=>setTimeout(r,500));
 const billing=await createBillingService(createAccountStore(dataFile)).getSummary(userId);assert.equal(billing.reserved,0);results.push({name:'downstream cancel releases or settles reservation',pass:true,reserved:billing.reserved});
}finally{await writeFile(join(out,'gateway-stream-fault-results.json'),JSON.stringify({at:new Date().toISOString(),synthetic:true,realModelCalls:0,results},null,2));child.kill();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));}
