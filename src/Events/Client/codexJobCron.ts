import { createHash } from 'node:crypto';
import { AttachmentBuilder, PermissionFlagsBits as P } from 'discord.js';
import { Event } from '../../Handlers/eventHandler';
import { MyClient } from '../../Model/client';
import { canShareChannel } from '../../Services/AI/discordAccess';
import { completedCodexJobs, codexSolverEnabled, formatCodexResult, getCodexJobFile, isDeliveredCodexReply, markCodexJobDelivered, pendingCodexDiscordReads, respondCodexDiscordRead, splitCodexReply } from '../../Services/AI/codexJobs';
import { readCodexDiscordContext } from '../../Services/AI/codexDiscordContext';
import { sanitizeMentions } from '../../Services/Moderation';

let initialized=false,running=false,reading=false;
const failures=new Map<string,number>();
const retryAt=new Map<string,number>();
const attachmentPermissionNote='\n\nFile hasil agent belum bisa dilampirkan karena izin Attach Files tidak tersedia di channel ini.';
const attachmentFailureNote='\n\nFile hasil agent gagal dikirim. Minta aku buat ulang jika masih diperlukan.';
function resultWithNote(job:Parameters<typeof formatCodexResult>[0],guild:any,note=''){
  return sanitizeMentions(formatCodexResult(job)+note,guild);
}

async function replyParts(jobId:string,original:any,botId:string|undefined,parts:string[],recent:any[],files:AttachmentBuilder[]=[]){
  const used=new Set<any>();
  for(const [index,content] of parts.entries()){
    const previous=recent.find(message=>!used.has(message)&&isDeliveredCodexReply(message,botId,original.id,content));
    if(previous){used.add(previous);continue;}
    const nonce=createHash('sha256').update(`${jobId}:${index}:${content}`).digest('hex').slice(0,24);
    await original.reply({content,files:index===parts.length-1?files:[],nonce,enforceNonce:true,allowedMentions:{parse:[],repliedUser:false}});
  }
}

export async function serveCodexDiscordReads(client:MyClient):Promise<void>{
  if(!codexSolverEnabled()||reading)return;reading=true;
  try{
    const {requests}=await pendingCodexDiscordReads();
    for(const request of requests){
      const result=await readCodexDiscordContext(client,request);
      await respondCodexDiscordRead(request.id,request.jobId,result).catch(()=>undefined);
    }
  }catch(error:unknown){console.warn('[CodexDiscordRead] controller unavailable:',String(error instanceof Error?error.message:error).slice(0,120));}
  finally{reading=false;}
}

export async function deliverCodexJobs(client:MyClient):Promise<void>{
  if(!codexSolverEnabled()||running)return;running=true;
  try{
    const {jobs}=await completedCodexJobs();
    const pendingIds=new Set(jobs.map(job=>job.id));
    for(const id of failures.keys())if(!pendingIds.has(id)){failures.delete(id);retryAt.delete(id);}
    for(const job of jobs){
      if((retryAt.get(job.id)||0)>Date.now())continue;
      let channel:any=null,original:any=null,allPartsSent=false;
      try{
        channel=await client.channels.fetch(job.channelId).catch(()=>null);
        if(!channel||channel.guildId!==job.guildId||!channel.isTextBased?.()||!channel.messages?.fetch){await markCodexJobDelivered(job.id);continue;}
        original=await channel.messages.fetch(job.messageId).catch(()=>null);
        const sendPermission=channel.isThread?.()?P.SendMessagesInThreads:P.SendMessages;
        if(!original||original.author?.id!==job.userId||!canShareChannel(original,channel)
          ||!channel.permissionsFor?.(original.guild?.members?.me)?.has(sendPermission)){await markCodexJobDelivered(job.id);continue;}
        // A send can succeed while the controller's delivered ACK fails.
        // Match the exact reply instead of exposing a job marker in chat.
        const canAttach=!!channel.permissionsFor?.(original.guild?.members?.me)?.has(P.AttachFiles);
        const hasFiles=!!job.exportedFiles?.length;
        const content=resultWithNote(job,original.guild,hasFiles&&!canAttach?attachmentPermissionNote:'');
        const recent=await channel.messages.fetch({limit:50}).catch(()=>null);
        const messages=Array.from(recent?.values()||[]);
        const parts=splitCodexReply(content);
        const files:AttachmentBuilder[]=[];
        const finalAlreadySent=messages.some((message:any)=>isDeliveredCodexReply(message,client.user?.id,original.id,parts.at(-1)||''));
        if(hasFiles&&canAttach&&!finalAlreadySent)for(const item of job.exportedFiles||[]){
          const delivered=await getCodexJobFile(job,item.index);
          const data=Buffer.from(delivered.data,'base64');
          if(delivered.name!==item.name||data.length!==item.size||createHash('sha256').update(data).digest('hex')!==item.sha256)
            throw Error('codex_file_mismatch');
          files.push(new AttachmentBuilder(data,{name:item.name}));
        }
        await replyParts(job.id,original,client.user?.id,parts,messages,files);
        allPartsSent=true;
        await markCodexJobDelivered(job.id);failures.delete(job.id);retryAt.delete(job.id);
      }catch(error){
        const count=(failures.get(job.id)||0)+1;failures.set(job.id,count);
        if(count>=5){
          console.error(`[CodexDelivery] job=${job.id.slice(0,8)} delivery failures=${count}; retaining undelivered text`);
          if(original&&job.exportedFiles?.length&&!allPartsSent){
            const content=resultWithNote(job,original.guild,attachmentFailureNote);
            const recent=await channel?.messages?.fetch({limit:50}).catch(()=>null);
            try{
              await replyParts(job.id,original,client.user?.id,splitCodexReply(content),Array.from(recent?.values()||[]));
              await markCodexJobDelivered(job.id);failures.delete(job.id);retryAt.delete(job.id);continue;
            }catch{ /* Retain the job for a later delivery attempt. */ }
          }
          retryAt.set(job.id,Date.now()+Math.min(300_000,30_000*2**Math.min(count-5,4)));
        }
        else console.warn(`[CodexDelivery] retry ${job.id.slice(0,8)} (${count}/5)`);
      }
    }
  }catch(error:any){console.warn('[CodexDelivery] controller unavailable:',String(error?.message||error).slice(0,120));}
  finally{running=false;}
}

export const event:Event={name:'clientReady',once:true,async execute(client:MyClient){
  if(initialized)return;initialized=true;if(!codexSolverEnabled())return;
  setTimeout(()=>void deliverCodexJobs(client),5000).unref?.();
  setInterval(()=>void deliverCodexJobs(client),15_000).unref?.();
  setInterval(()=>void serveCodexDiscordReads(client),1500).unref?.();
  console.log('✅ Isolated Codex result delivery loaded');
}};
