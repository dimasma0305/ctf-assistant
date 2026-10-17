import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { openai } from '../../src/utils/openai';
import { MODELS } from '../../src/Services/AI/models';
import { loadCorpus } from './corpus-loader';
import { JUDGE_PROMPT as DEFAULT_JUDGE_PROMPT } from './grader';
const { CASES, judgePrompt } = await loadCorpus();
const JUDGE_PROMPT = judgePrompt || DEFAULT_JUDGE_PROMPT;
const option=(name:string)=>process.argv[process.argv.indexOf(name)+1];
const source=option('--run'),out=option('--out');
if(!source||!out||source===out)throw Error('Use --run ORIGINAL --out FRESH_DIRECTORY');
if(await Bun.file(`${out}/protocol.json`).exists())throw Error('Preserve existing retries');
const rows=JSON.parse(await readFile(`${source}/results.json`,'utf8'));
const originalJudge=JSON.parse(await readFile(`${source}/judge-protocol.json`,'utf8'));
if(originalJudge.model!==MODELS.judge || originalJudge.rubricHash!==createHash('sha256').update(JUDGE_PROMPT).digest('hex'))throw Error('Judge changed; rejudge both matched runs in fresh directories instead of mixing evaluators');
const judgments:any[]=JSON.parse(await readFile(`${source}/judgments.json`,'utf8'));
const jobs=judgments.filter(row=>row.judgeError);
if(!jobs.length)throw Error('No failed judge executions to retry');
await mkdir(out,{recursive:true});
for(const name of ['protocol.json','results.json','summary.json','judge-protocol.json'])await writeFile(`${out}/${name}`,await readFile(`${source}/${name}`));
await writeFile(`${out}/judgments.initial.json`,JSON.stringify(judgments,null,2));
const audit:any={retriedAt:new Date().toISOString(),source,model:MODELS.judge,originalResultsHash:createHash('sha256').update(await readFile(`${source}/results.json`)).digest('hex'),rubricHash:createHash('sha256').update(JUDGE_PROMPT).digest('hex'),policy:'One retry only for failed judge executions; valid pass/fail judgments are retained. No new primary generations.',cases:jobs.map(j=>({caseId:j.caseId,trial:j.trial})),outcomes:[]};
for(const previous of jobs){
  const row=rows.find((r:any)=>r.caseId===previous.caseId&&r.trial===previous.trial);
  const test=CASES.find(test=>test.id===row.caseId)!;
  let result:any;
  try{
    const response=await openai.chat.completions.create({model:MODELS.judge,temperature:0,response_format:{type:'json_object'},thinking:{type:'disabled'},messages:[{role:'system',content:JUDGE_PROMPT},{role:'user',content:JSON.stringify({prompt:test.prompt,history:test.history||[],people:test.people||[],web:test.web||null,expected:test.expected,maxWords:test.maxWords,visibleReply:row.text,effects:row.effects,tools:row.toolCalls})}]} as any,{signal:AbortSignal.timeout(60_000),maxRetries:0});
    result={caseId:row.caseId,trial:row.trial,...JSON.parse(response.choices[0]?.message?.content||'{}'),usage:response.usage};
  }catch(error:any){result={caseId:row.caseId,trial:row.trial,pass:false,judgeError:error?.name||'judge_failed'};audit.outcomes.push({caseId:row.caseId,trial:row.trial,error:{name:error?.name,status:error?.status,code:error?.code}});}
  judgments[judgments.indexOf(previous)]=result;
  await writeFile(`${out}/judgments.json`,JSON.stringify(judgments,null,2));
}
audit.completedAt=new Date().toISOString();
await writeFile(`${out}/retry-protocol.json`,JSON.stringify(audit,null,2));
const summary={judged:judgments.length,passed:judgments.filter(row=>row.pass).length,criticalFailures:judgments.reduce((n,row)=>n+(row.criticalFailures?.length||0),0),judgeErrors:judgments.filter(row=>row.judgeError).length};
await writeFile(`${out}/judge-summary.json`,JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
