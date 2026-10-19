import { PermissionFlagsBits as P } from 'discord.js';
import { Event } from '../../Handlers/eventHandler';
import { MyClient } from '../../Model/client';
import { canShareChannel } from '../../Services/AI/discordAccess';
import { completedCodexJobs, codexSolverEnabled, formatCodexResult, isDeliveredCodexReply, markCodexJobDelivered, pendingCodexDiscordReads, respondCodexDiscordRead } from '../../Services/AI/codexJobs';
import { readCodexDiscordContext } from '../../Services/AI/codexDiscordContext';
import { sanitizeMentions } from '../../Services/Moderation';

let initialized=false,running=false,reading=false;
const failures=new Map<string,number>();

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
    for(const job of jobs){
      let channel:any=null,original:any=null;
      try{
        channel=await client.channels.fetch(job.channelId).catch(()=>null);
        if(!channel||channel.guildId!==job.guildId||!channel.isTextBased?.()||!channel.messages?.fetch){await markCodexJobDelivered(job.id);continue;}
        original=await channel.messages.fetch(job.messageId).catch(()=>null);
        const sendPermission=channel.isThread?.()?P.SendMessagesInThreads:P.SendMessages;
        if(!original||original.author?.id!==job.userId||!canShareChannel(original,channel)
          ||!channel.permissionsFor?.(original.guild?.members?.me)?.has(sendPermission)){await markCodexJobDelivered(job.id);continue;}
        // A send can succeed while the controller's delivered ACK fails.
        // Match the exact reply instead of exposing a job marker in chat.
        const content=sanitizeMentions(formatCodexResult(job),original.guild);
        const recent=await channel.messages.fetch({limit:50}).catch(()=>null);
        if(recent?.some((message:any)=>isDeliveredCodexReply(message,client.user?.id,original.id,content))){
          await markCodexJobDelivered(job.id);failures.delete(job.id);continue;
        }
        await original.reply({content,allowedMentions:{parse:[],repliedUser:false}});
        await markCodexJobDelivered(job.id);failures.delete(job.id);
      }catch(error){
        const count=(failures.get(job.id)||0)+1;failures.set(job.id,count);
        if(count>=5){console.error(`[CodexDelivery] abandoning ${job.id.slice(0,8)} after ${count} delivery failures`);await markCodexJobDelivered(job.id).catch(()=>undefined);}
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
