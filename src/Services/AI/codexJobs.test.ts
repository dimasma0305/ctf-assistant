import {expect,test} from 'bun:test';
import {normalizeCodexJobList,type CodexPublicJob} from './codexJobs';

const job=(id:string,state:CodexPublicJob['state']):CodexPublicJob=>({id,state,createdAt:1,updatedAt:1,objective:id,progress:[],steering:[],sources:[]});

test('legacy controller job lists are filtered and counted in the bot',()=>{
  const response={ok:true as const,jobs:[job('done','completed'),job('queued','pending'),job('live','running')]};
  expect(normalizeCodexJobList(response,'running')).toEqual({ok:true,state:'running',count:1,jobs:[response.jobs[2]]});
  expect(normalizeCodexJobList(response,'active')).toEqual({ok:true,state:'active',count:2,jobs:[response.jobs[1],response.jobs[2]]});
});

test('controller count is retained when pagination hides older matching jobs',()=>{
  const response={ok:true as const,state:'running' as const,count:3,jobs:[job('live','running')]};
  expect(normalizeCodexJobList(response,'running').count).toBe(3);
});
