import { expect, test } from 'bun:test';
import { ChannelType } from 'discord.js';
import { readCodexDiscordContext } from './codexDiscordContext';

const guildId='555555555555555555',channelId='700000000000000001';
const sourceId='800000000000000001',imageId='800000000000000002',userId='663394727688798231',botId='663394727688798232';
const imageUrl=`https://cdn.discordapp.com/attachments/${channelId}/${imageId}/clue.png`;
const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0,0,0,0,0]);
const request={id:'request',jobId:'job',guildId,channelId,userId,sourceMessageId:sourceId,kind:'message' as const,messageId:imageId,limit:20,includeImage:true};

function fixture(canRead=true){
  const caller={id:userId},bot={id:botId};
  const guild={id:guildId,members:{me:bot,fetch:async(id:string)=>id===userId?caller:id===botId?bot:null}};
  const source={id:sourceId,channelId,guildId,guild,author:{id:userId,username:'Dimas',bot:false},
    member:caller,content:'tolong cek gambar',createdTimestamp:1,reference:null,attachments:new Map(),embeds:[]};
  const image={id:imageId,channelId,guildId,guild,author:{id:userId,username:'Dimas',bot:false},
    member:caller,content:'clue berikutnya',createdTimestamp:2,reference:{messageId:sourceId},
    attachments:new Map([['image',{name:'clue.png',url:imageUrl,size:png.length,contentType:'image/png'}]]),
    embeds:[{data:{type:'rich'},title:'hint',description:'angka di pojok kanan',url:null,fields:[],image:null as null|{proxyURL:string}}]};
  const messages=new Map([[sourceId,source],[imageId,image]]);
  const channel={id:channelId,guildId,type:ChannelType.GuildText,isThread:()=>false,
    permissionsFor:()=>({has:()=>canRead}),messages:{fetch:async(value:string|{limit:number})=>typeof value==='string'?messages.get(value):new Map([...messages].slice(-value.limit))}};
  return {client:{user:{id:botId},channels:{fetch:async()=>channel}},channel,image};
}

test('a worker read obtains current same-channel text, embed and real image bytes',async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=(async()=>new Response(png,{status:200,headers:{'Content-Length':String(png.length)}})) as unknown as typeof fetch;
  try{
    const result=await readCodexDiscordContext(fixture().client as never,request) as {ok:boolean;messages:Array<{content:string;embeds:Array<{title:string}>}>;images:Array<{data:string;sourceMessageId:string}>};
    expect(result.ok).toBe(true);
    expect(result.messages[0].content).toBe('clue berikutnya');
    expect(result.messages[0].embeds[0].title).toBe('hint');
    expect(Buffer.from(result.images[0].data,'base64')).toEqual(png);
    expect(result.images[0].sourceMessageId).toBe(imageId);
  }finally{globalThis.fetch=originalFetch;}
});

test('a Discord-proxied embed image supplies pixels when there is no attachment',async()=>{
  const setup=fixture(),originalFetch=globalThis.fetch;
  setup.image.attachments.clear();
  setup.image.embeds[0].image={proxyURL:'https://media.discordapp.net/external/abc123456789/https/example.com/clue.png'};
  globalThis.fetch=(async()=>new Response(png,{status:200,headers:{'Content-Type':'image/png'}})) as unknown as typeof fetch;
  try{
    const result=await readCodexDiscordContext(setup.client as never,request) as {ok:boolean;images:Array<{data:string;name:string}>};
    expect(result.ok).toBe(true);expect(result.images[0].name).toBe('embed-image.png');
    expect(Buffer.from(result.images[0].data,'base64')).toEqual(png);
  }finally{globalThis.fetch=originalFetch;}
});

test('Discord read denies lost permission and messages outside the original channel',async()=>{
  const denied=await readCodexDiscordContext(fixture(false).client as never,request) as {error:string};
  expect(denied.error).toBe('access_denied');
  const cross=await readCodexDiscordContext(fixture().client as never,{...request,messageId:'800000000000000099'}) as {ok:boolean;messages:unknown[]};
  expect(cross.ok).toBe(true);expect(cross.messages).toEqual([]);
});
