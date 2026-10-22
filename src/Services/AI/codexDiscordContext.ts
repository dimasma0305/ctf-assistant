import { ChannelType, PermissionFlagsBits as P, type Collection, type GuildMember, type Message } from 'discord.js';
import { createHash } from 'node:crypto';
import type { MyClient } from '../../Model/client';
import { canShareChannel, type ChatMessage } from './discordAccess';
import { collectCodexArtifacts, imageMagic, responseBytes } from './ctfInputs';
import { allowedDiscordImageUrl } from './vision';
import type { ThreadSource } from './threadContext';
import type { CodexDiscordReadRequest } from './codexJobs';

type ReadableChannel = {
  id:string;guildId:string;type:ChannelType;
  isThread:()=>boolean;
  members?:{cache:Map<string,unknown>;fetch:(id:string)=>Promise<unknown>};
  permissionsFor:(member:GuildMember)=>{has:(permission:bigint)=>boolean}|null;
  messages:{fetch:(query:string|{limit:number;before?:string})=>Promise<Message|Collection<string,Message>>};
};

function discordProxyImageUrl(value:unknown):value is string {
  if(typeof value!=='string'||value.length>8192)return false;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port
    &&url.hostname==='media.discordapp.net'&&/^\/external\/[A-Za-z0-9_-]{8,}\/.+/.test(url.pathname);}
  catch{return false;}
}

async function readEmbedImage(message:Message):Promise<{name:string;data:string;image:boolean;sourceMessageId:string}|null>{
  const url=message.embeds.flatMap(embed=>[embed.image?.proxyURL,embed.thumbnail?.proxyURL]).find(discordProxyImageUrl);
  if(!url)return null;
  try{
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10_000)});
    if(!response.ok)throw Error('embed_image_unavailable');
    const bytes=await responseBytes(response,4*1024*1024);
    if(!imageMagic(bytes))throw Error('not_supported_image');
    const mime=response.headers.get('content-type')||'';
    const extension=mime.includes('jpeg')?'jpg':mime.includes('gif')?'gif':mime.includes('webp')?'webp':'png';
    return {name:`embed-image.${extension}`,data:bytes.toString('base64'),image:true,sourceMessageId:message.id};
  }catch{return null;}
}

function summarize(message:Message) {
  return {
    id:message.id,channelId:message.channelId,authorId:message.author.id,
    authorName:String(message.member?.displayName||message.author.displayName||message.author.username).slice(0,100),
    isBot:message.author.bot,sentAt:message.createdTimestamp,
    replyToMessageId:message.reference?.messageId||undefined,
    content:String(message.content||'').slice(0,4000),
    embeds:message.embeds.slice(0,4).map(embed=>({type:embed.data.type,title:String(embed.title||'').slice(0,300),
      description:String(embed.description||'').slice(0,1200),url:String(embed.url||'').slice(0,1200),
      fields:embed.fields.slice(0,8).map(field=>({name:field.name.slice(0,100),value:field.value.slice(0,500)})),
      imageUrl:String(embed.image?.proxyURL||embed.image?.url||'').slice(0,1200)})),
    attachments:[...message.attachments.values()].slice(0,8).map(item=>({name:item.name.slice(0,160),size:item.size,
      contentType:item.contentType||undefined,image:!!item.contentType?.startsWith('image/')})),
  };
}

/** The only Discord read path for an isolated CTF worker. The bot rechecks the
 * requestor's current visibility before each read, including private threads. */
export async function readCodexDiscordContext(client:MyClient, request:CodexDiscordReadRequest):Promise<unknown> {
  try {
    if (!/^\d{17,20}$/.test(request.channelId)||!/^\d{17,20}$/.test(request.sourceMessageId)) return {ok:false,error:'invalid_scope'};
    const fetched=await client.channels.fetch(request.channelId).catch(()=>null);
    const channel=fetched as unknown as ReadableChannel|null;
    if (!channel||channel.guildId!==request.guildId||!channel.messages?.fetch||!channel.permissionsFor) return {ok:false,error:'channel_unavailable'};
    const original=await channel.messages.fetch(request.sourceMessageId).catch(()=>null) as Message|null;
    if (!original||original.guildId!==request.guildId||original.channelId!==request.channelId||original.author.id!==request.userId||!original.guild) return {ok:false,error:'source_unavailable'};
    const caller=await original.guild.members.fetch(request.userId).catch(()=>null);
    const bot=await original.guild.members.fetch(client.user?.id||'').catch(()=>null);
    if (!caller||!bot) return {ok:false,error:'access_denied'};
    if (channel.type===ChannelType.PrivateThread) {
      await Promise.all([channel.members?.fetch(request.userId).catch(()=>null),channel.members?.fetch(bot.id).catch(()=>null)]);
    }
    const source={guild:original.guild,member:caller,author:original.author,channelId:original.channelId} as ChatMessage;
    if (!canShareChannel(source,channel)||!channel.permissionsFor(caller)?.has(P.ReadMessageHistory)
      ||!channel.permissionsFor(bot)?.has(P.ReadMessageHistory)) return {ok:false,error:'access_denied'};

    let messages:Message[];
    if (request.kind==='message') {
      if (!request.messageId||!/^\d{17,20}$/.test(request.messageId)) return {ok:false,error:'invalid_message_id'};
      const target=await channel.messages.fetch(request.messageId).catch(()=>null) as Message|null;
      messages=target&&target.channelId===request.channelId?[target]:[];
    } else if (request.kind==='recent') {
      const limit=Math.max(1,Math.min(30,Number(request.limit)||20));
      const before=request.before&&/^\d{17,20}$/.test(request.before)?request.before:undefined;
      const batch=await channel.messages.fetch({limit,...(before?{before}:{})}) as Collection<string,Message>;
      messages=[...batch.values()].filter(item=>item.channelId===request.channelId).sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
    } else return {ok:false,error:'invalid_query'};
    if(request.includeFile){
      const target=messages[0];
      if(request.kind!=='message'||!target||target.author.id!==client.user?.id)
        return {ok:false,error:'own_file_unavailable'};
      const attachment=[...target.attachments.values()].find(item=>(!request.fileName||item.name===request.fileName)
        &&Number.isFinite(item.size)&&item.size>0&&item.size<=4*1024*1024&&allowedDiscordImageUrl(item.url));
      if(!attachment)return {ok:false,error:'own_file_unavailable'};
      try{
        const response=await fetch(attachment.url,{redirect:'error',signal:AbortSignal.timeout(15_000)});
        if(!response.ok)throw Error('file_download_failed');
        const bytes=await responseBytes(response,4*1024*1024);
        if(bytes.length!==attachment.size)throw Error('file_size_mismatch');
        return {ok:true,scope:{guildId:request.guildId,channelId:request.channelId},
          file:{name:attachment.name.slice(0,160),sourceMessageId:target.id,size:bytes.length,
            sha256:createHash('sha256').update(bytes).digest('hex'),data:bytes.toString('base64')}};
      }catch{return {ok:false,error:'own_file_unavailable'};}
    }
    const imageSource=request.includeImage ? [...messages].reverse().find(message=>[...message.attachments.values()]
      .some(item=>item.size>0&&item.size<=4*1024*1024&&allowedDiscordImageUrl(item.url)&&!!item.contentType?.startsWith('image/'))
      ||message.embeds.some(embed=>discordProxyImageUrl(embed.image?.proxyURL)||discordProxyImageUrl(embed.thumbnail?.proxyURL))) : undefined;
    let images:Awaited<ReturnType<typeof collectCodexArtifacts>>=[];
    if (imageSource) {
      const source:ThreadSource={id:imageSource.id,channelId:imageSource.channelId,authorId:imageSource.author.id,
        authorName:imageSource.author.username,isBot:false,content:'',createdAt:imageSource.createdTimestamp,
        attachments:[...imageSource.attachments.values()].filter(item=>item.size<=4*1024*1024&&!!item.contentType?.startsWith('image/'))
          .slice(0,1).map(item=>({name:item.name,url:item.url,size:item.size,contentType:item.contentType||''}))};
      images=(await collectCodexArtifacts([source],AbortSignal.timeout(10_000),source.id)).slice(0,1);
      if(!images.length){const embedded=await readEmbedImage(imageSource);if(embedded)images=[embedded];}
    }
    return {ok:true,scope:{guildId:request.guildId,channelId:request.channelId},messages:messages.map(summarize),images};
  } catch { return {ok:false,error:'discord_read_failed'}; }
}
