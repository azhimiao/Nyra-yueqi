/** Read-only post-processing of the live diagnostic run; no provider calls. */
import fs from "node:fs";
const dir = "docs/qa/dialogue-evaluation";
const resultPath = `${dir}/live-conversations.json`;
const snapshotPath = `${dir}/live-request-snapshots.json`;
const run = JSON.parse(fs.readFileSync(resultPath,"utf8"));
const snapshots = JSON.parse(fs.readFileSync(snapshotPath,"utf8"));
const requests = snapshots.filter(r=>r.businessPurpose==="chat.companion_reply");
const latestUser = r => [...(r.messages||[])].reverse().find(m=>m.role==="user")?.content?.trim() || "";
const tierCursor = new Map();
const turns = (run.results||[]).map(row=>{
  const sameTier = requests.filter(r=>r.tier===row.tier);
  const start = tierCursor.get(row.tier) || 0;
  let requestIndex = sameTier.findIndex((r,i)=>i>=start&&latestUser(r)===row.input.trim());
  if(requestIndex>=0) tierCursor.set(row.tier,requestIndex+1);
  const current = requestIndex>=0?sameTier[requestIndex]:null;
  let reply = String(row.reply||"").trim();
  let evidence = reply?{kind:"live_result_visible_reply"}:null;
  if(!reply&&current) {
    for(const future of sameTier.slice(requestIndex+1)) {
      const messages = future.messages||[];
      const currentInputIndex = messages.findLastIndex(m=>m.role==="user");
      let previousUserIndex = -1;
      for(let i=currentInputIndex-1;i>=0;i--) {
        if(messages[i].role==="user"&&String(messages[i].content||"").trim()===row.input.trim()) { previousUserIndex=i; break; }
      }
      if(previousUserIndex<0) continue;
      const replies=[];
      for(let i=previousUserIndex+1;i<messages.length;i++) {
        if(messages[i].role==="user") break;
        if(messages[i].role==="assistant"&&String(messages[i].content||"").trim()) replies.push({messageIndex:i,content:messages[i].content,provenance:messages[i].provenance||""});
      }
      if(!replies.length) continue;
      reply=replies.map(r=>r.content).join("\n\n");
      evidence={kind:"persisted_assistant_history_in_later_request",sourceRequestNumber:future.requestNumber,sourceTier:future.tier,userMessageIndex:previousUserIndex,assistantMessageIndexes:replies.map(r=>r.messageIndex),provenances:replies.map(r=>r.provenance),recoveredFromLaterTurn:true};
      break;
    }
  }
  if(!reply&&current) {
    // Classification receives the already-public, persisted turn, not provider
    // reasoning. Match the exact user sentence and fixed wrapper; never parse
    // arbitrary system text or include the memory extractor's instructions.
    const nextSameInput = sameTier.slice(requestIndex+1).find(r=>latestUser(r)===row.input.trim());
    const marker = `\n用户：${row.input}\n助手：`;
    const suffix = "\n请抽取可持久记忆操作。";
    for(const request of snapshots.filter(r=>r.tier===row.tier&&r.businessPurpose==="context.classification"&&r.requestNumber>current.requestNumber&&(!nextSameInput||r.requestNumber<nextSameInput.requestNumber))) {
      const candidate = (request.messages||[]).find(m=>m.role==="user"&&String(m.content||"").includes(marker));
      if(!candidate) continue;
      const body = candidate.content.slice(candidate.content.indexOf(marker)+marker.length);
      if(!body.endsWith(suffix)) continue;
      const publicReply = body.slice(0,-suffix.length).trim();
      if(!publicReply) continue;
      reply=publicReply;
      evidence={kind:"same_turn_public_reply_in_classification_input",sourceRequestNumber:request.requestNumber,sourceTier:request.tier,sourcePurpose:request.businessPurpose,exactUserSentenceMatched:true,providerReasoningRead:false};
      break;
    }
  }
  const harnessLimit = String(row.traceError?.message||"").includes("evaluation_call_limit");
  const evaluationStatus = harnessLimit ? "excluded_harness_call_limit" : reply ? "observable_public_reply" : row.status==="completed" ? "completed_reply_text_unavailable" : "unreviewed_run_error";
  if(harnessLimit) evidence={kind:"harness_call_limit_not_sent_to_provider",reason:"The evaluation harness rejected this call before provider dispatch. Do not count it as a product/model failure, timing sample, or generated reply.",error:row.traceError.message};
  return {tier:row.tier,turn:row.turn,afterReload:row.afterReload||false,input:row.input,runStatus:row.status,evaluationStatus,eligibleForModelQualityEvaluation:!harnessLimit&&row.status==="completed"&&Boolean(reply),eligibleForTiming:!harnessLimit&&row.status==="completed",reply,evidence: evidence||{kind:"pending_no_later_request_or_visible_reply",reason:current?"The last turn has no later request carrying its persisted assistant message yet.":"No matching companion request in the current snapshot."},requestNumber:current?.requestNumber??null,characterTokens:row.blockStats?.find(b=>b.id==="character")?.tokens??null,latency:{firstVisibleMs:row.firstVisibleMs??null,elapsedMs:row.elapsedMs??null,visibleUpdates:row.visibleUpdates??null}};
});
const output={derivedAt:new Date().toISOString(),sourceRunCheckedAt:run.checkedAt,scope:"Synthetic live evaluation prompts only. Recovered text is the app-persisted assistant reply passed to later chat or same-turn memory classification calls, not provider reasoning and not independent proof of the DOM rendering.",sourceFiles:[resultPath,snapshotPath],sourceSnapshotCount:snapshots.length,summary:{turns:turns.length,completed:turns.filter(t=>t.runStatus==="completed").length,recoveredFromLaterHistory:turns.filter(t=>t.evidence.kind==="persisted_assistant_history_in_later_request").length,recoveredFromClassification:turns.filter(t=>t.evidence.kind==="same_turn_public_reply_in_classification_input").length,direct:turns.filter(t=>t.evidence.kind==="live_result_visible_reply").length,completedReplyTextUnavailable:turns.filter(t=>t.evaluationStatus==="completed_reply_text_unavailable").length,excludedHarnessCallLimit:turns.filter(t=>t.evaluationStatus==="excluded_harness_call_limit").length},turns};
fs.writeFileSync(`${dir}/visible-turns.json`,JSON.stringify(output,null,2)+"\n");
console.log(JSON.stringify(output,null,2));
