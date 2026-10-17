import { chmod } from 'node:fs/promises';
import { ChatGPTAuth, CHATGPT_RESOURCE } from '../../src/Services/AI/chatgptAuth';
import { ResearchSourceReader, publicResearchUrl } from '../../src/Services/AI/researchSources';
import { webSearchForTool } from '../../src/Services/AI/web';
import type { Job } from './protocol';
export async function startGateway(socket: string, job: Job, model: string, signal: AbortSignal, dependencies: {
  credentials?: () => Promise<{access_token:string}>; fetcher?:typeof fetch; maxCalls?:number; maxInputChars?:number;
}={}) {
  const auth=new ChatGPTAuth(), credentials=dependencies.credentials||(()=>auth.credentials(signal));
  const fetcher=dependencies.fetcher||fetch;let active=false;const sources:any[]=[];
  job.stats.searches ||= 0;job.stats.sourceReads ||= 0;
  const allowedSources=new Set<string>();
  for(const match of `${job.packet.question}\n${job.packet.context}\n${JSON.stringify(job.packet.checkpoint||{})}`.matchAll(/https?:\/\/[^\s<>`"']+/g)){
    const url=publicResearchUrl(match[0].replace(/[),.!?;]+$/,''));if(url&&allowedSources.size<24)allowedSources.add(url);
  }
  for(const source of job.sources||[]){const url=publicResearchUrl(source.url);if(url&&allowedSources.size<60)allowedSources.add(url);}
  const server=Bun.serve({unix:socket,maxRequestBodySize:32*1024*1024,
    async fetch(request){
      try{
        const path=new URL(request.url).pathname;
        if(signal.aborted)return Response.json({error:'job_closed'},{status:410});
        if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
        if(path==='/sources/search'){
          if(++job.stats.searches>2)return Response.json({error:'search_budget'},{status:429});
          const x=await request.json() as any;const query=String(x?.query||'').trim();
          if(!query||query.length>350||/[\w-]+\{[^}]*\}|%7[bBdD]|\b(?:sk-[\w-]+|Bearer\s+\S+)|<@!?\d+>|(?:password|api.?key|token)\s*[:=]/i.test(query))
            return Response.json({error:'invalid_or_private_query'},{status:400});
          const result=await webSearchForTool({query,maxResults:5},{signal});
          if(result.ok)for(const row of result.results||[]){const url=publicResearchUrl(row.url);if(url&&allowedSources.size<60)allowedSources.add(url);}
          return Response.json(result);
        }
        if(path==='/sources/read'){
          if(++job.stats.sourceReads>8)return Response.json({error:'source_budget'},{status:429});
          const x=await request.json() as any;const url=publicResearchUrl(x?.url);
          if(!url||!allowedSources.has(url)||/[\w-]+\{[^}]+\}|%7[bBdD]|(?:token|password|secret|authorization)=/i.test(url))return Response.json({error:'invalid_or_private_source'},{status:400});
          const doc=await new ResearchSourceReader(signal).read(url,String(x.query||'').slice(0,350));
          for(const link of doc.links||[]){const next=publicResearchUrl(link.url);if(next&&new URL(next).origin===new URL(url).origin&&allowedSources.size<60)allowedSources.add(next);}
          sources.push({url:doc.url,title:doc.title,content:doc.content.slice(0,12000)});return Response.json(doc);
        }
        if(path!=='/v1/responses')return Response.json({error:'route_not_found'},{status:404});
        const waitStarted=Date.now();while(active&&Date.now()-waitStarted<15_000)await new Promise(resolve=>setTimeout(resolve,25));
        if(active||job.stats.calls>=(dependencies.maxCalls||10))return Response.json({error:'model_call_budget'},{status:429});
        const text=await request.text();const body=JSON.parse(text);job.stats.inputChars+=JSON.stringify(body,(_key,value)=>typeof value==='string'&&value.startsWith('data:image/')?'[inline image]':value).length;
        if(job.stats.inputChars>(dependencies.maxInputChars||1_200_000))return Response.json({error:'input_budget'},{status:429});
        if(body.model!==model)return Response.json({error:'model_not_allowed'},{status:403});
        const allowed=(tools:any[]):boolean=>Array.isArray(tools)&&tools.every(t=>t?.type==='function'||t?.type==='custom'||t?.type==='namespace'&&allowed(t.tools));
        if(body.tools&&!allowed(body.tools))return Response.json({error:'server_tools_not_allowed'},{status:403});
        active=true;job.stats.calls++;
        try{
          const token=await credentials();
          const forwarded:any={...body,model,store:false,stream:true,max_output_tokens:Math.min(Number(body.max_output_tokens)||4096,4096)};
          delete forwarded.previous_response_id;delete forwarded.background;
          const response=await fetcher(`${CHATGPT_RESOURCE}/responses`,{method:'POST',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(65000)]),
            headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(forwarded)});
          if(!response.ok){active=false;await response.body?.cancel();return Response.json({error:{message:`inference_http_${response.status}`,type:'upstream_error'}},{status:response.status});}
          if(!response.body)throw Error('missing_model_stream');
          const reader=response.body.getReader();let bytes=0;
          return new Response(new ReadableStream({async pull(controller){try{const item=await reader.read();if(item.done){active=false;controller.close();return;}bytes+=item.value.byteLength;job.stats.outputBytes+=item.value.byteLength;
            if(bytes>2*1024*1024||job.stats.outputBytes>8*1024*1024)throw Error('output_budget');controller.enqueue(item.value);}catch{active=false;await reader.cancel().catch(()=>{});controller.error(Error('model_stream_failed'));}},async cancel(){active=false;await reader.cancel().catch(()=>{});}}),{headers:{'Content-Type':'text/event-stream'}});
        }catch{active=false;return Response.json({error:{message:'inference_unavailable',type:'upstream_error'}},{status:502});}
      }catch{return Response.json({error:'request_failed'},{status:400});}
    }});
  await chmod(socket,0o666); // Parent is owner-only; only this job receives this socket.
  const stop=()=>{server.stop(true);};signal.addEventListener('abort',stop,{once:true});
  return {sources,close(){signal.removeEventListener('abort',stop);stop();}};
}
