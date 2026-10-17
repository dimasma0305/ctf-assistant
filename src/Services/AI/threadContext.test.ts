import { expect, test } from 'bun:test';
import { loadThreadContext, formatThreadContext, invalidateThreadContext } from './threadContext';
import { mergeTeamProgress } from './ctfProgress';
import { collectCTFInputs } from './ctfInputs';
let unique=0;
const make = (count=140) => {
 const channelId=String(700000000000010000n+BigInt(++unique)), guildId='555555555555555555';
 const calls:any[]=[];const permission={has:()=>true};
 const channel:any={id:channelId,guildId,name:'CTF OSINT',isThread:()=>true,permissionsFor:()=>permission};
 const rows:any[]=Array.from({length:count},(_,i)=>({id:String(800000000000000000n+BigInt(i)),channelId,guildId,content:i===5?'CTF OSINT\n1. Ada Stone\n2. White Hall\n8. A\nTinggal nomor 9, tanggal masih kandidat':`chat ${i}`,author:{id:'teammate',username:'W',bot:false},createdTimestamp:Date.now()-10*60*60_000+i*1000,attachments:new Map(),embeds:[]}));
 channel.messages={fetch:async(args:any)=>{calls.push(args);return new Map(rows.filter(m=>!args.before||BigInt(m.id)<BigInt(args.before)).slice(-args.limit).reverse().map(m=>[m.id,m]));}};
 const turn:any={id:'900000000000000000',content:'bantu ini <@1077393568647352320>',channelId,guildId,channel,createdTimestamp:Date.now()-10000,author:{id:'caller',username:'Dimas',bot:false},member:{id:'caller'},guild:{id:guildId,members:{me:{id:'bot'}}},attachments:new Map()};
 return {turn,rows,channel,calls};
};
test('thread history includes original discoveries beyond 30 messages and two hours',async()=>{
 const {turn,calls}=make();const s=(await loadThreadContext(turn))!;
 expect(calls).toHaveLength(2);expect(s.coverage.complete).toBe(true);expect(s.coverage.fetched).toBe(141);
 expect(formatThreadContext(s)).toContain('1. Ada Stone');expect(formatThreadContext(s)).toContain('Tinggal nomor 9');
 const next=(await loadThreadContext(turn))!;expect(calls).toHaveLength(3);expect(next.messages.some(m=>m.content.includes('Ada Stone'))).toBe(true);
});
test('late teammate updates, edits and deletion invalidation are authoritative',async()=>{
 const {turn,rows}=make(2);const first=(await loadThreadContext(turn))!;expect(first.coverage.complete).toBe(true);
 rows.push({...rows[0],id:'900000000000000001',createdTimestamp:Date.now()-5000,content:'Koreksi, golongan darahnya A. Tinggal nomor 9.'});
 const late=(await loadThreadContext(turn))!;expect(formatThreadContext(late)).toContain('Koreksi, golongan darahnya A');
 rows[0].content='edited original';invalidateThreadContext(turn.channelId);
 expect((await loadThreadContext(turn))!.messages.find(m=>m.id===rows[0].id)?.content).toBe('edited original');
 const deleted=rows.shift()!;invalidateThreadContext(turn.channelId);
 expect((await loadThreadContext(turn))!.messages.some(m=>m.id===deleted.id)).toBe(false);
});
test('only the exact accessible parent starter can enter a thread; sibling/hidden data stays out',async()=>{
 const {turn,channel}=make(2);let reads=0;
 channel.parent={id:'parent',guildId:turn.guildId,permissionsFor:()=>({has:()=>true})};
 channel.fetchStarterMessage=async()=>{reads++;return{id:channel.id,channelId:'parent',guildId:turn.guildId,content:'original CTF question 9: phone drop date',author:{id:'starter',username:'author',bot:false},attachments:new Map()};};
 const snapshot=(await loadThreadContext(turn))!;expect(snapshot.starter?.content).toContain('original CTF question');expect(reads).toBe(1);
 channel.parent.permissionsFor=()=>({has:()=>false});invalidateThreadContext(turn.channelId);
 expect((await loadThreadContext(turn))!.starter).toBeUndefined();expect(reads).toBe(1);
 channel.parent.permissionsFor=()=>({has:()=>true});channel.fetchStarterMessage=async()=>({...turn,id:'unrelated',channelId:'parent',content:'PRIVATE-CANARY'});
 expect(formatThreadContext(await loadThreadContext(turn))).not.toContain('PRIVATE-CANARY');
});
test('pagination is bounded and missing history permissions never claim complete history',async()=>{
 const {turn,calls,channel}=make(700);const s=(await loadThreadContext(turn))!;expect(calls).toHaveLength(6);expect(s.coverage.limited).toBe(true);expect(s.coverage.complete).toBe(false);
 channel.permissionsFor=()=>({has:()=>false});expect(await loadThreadContext(turn)).toBe(null);
});
test('revoked thread access cannot fall back to earlier history or the regular channel collector',async()=>{
 const {turn,calls,channel}=make(2);const initial=(await loadThreadContext(turn))!;const before=calls.length;
 channel.permissionsFor=()=>({has:()=>false});
 const result=await collectCTFInputs(turn,{text:'PRIVATE-OLD-HISTORY',thread:initial},new AbortController().signal);
 expect(calls).toHaveLength(before);expect(result.text).not.toContain('PRIVATE-OLD-HISTORY');expect(result.originals).toHaveLength(0);
});
test('teammate progress requires original authored quotes, keeps corrections and cannot become web verification',()=>{
 const raw=(id:string,content:string,createdAt:number,isBot=false)=>({id,content,createdAt,isBot,authorId:'u'+id,authorName:'teammate',channelId:'thread',attachments:[]});
 const originals=[raw('old','Blood type O',1),raw('new','Koreksi: blood type A. Tinggal nomor 9.',2),raw('bot','Blood type AB',3,true)];
 const previous=mergeTeamProgress(undefined,{entries:[{item:'8 blood type',value:'O',evidence:[{messageId:'old',quote:'Blood type O'}]}]},originals);
 const next=mergeTeamProgress(previous,{entries:[{item:'8',value:'A',state:'verified',evidence:[{messageId:'new',quote:'blood type A'}]},{item:'10',value:'AB',evidence:[{messageId:'bot',quote:'Blood type AB'}]},{item:'11',value:'made up',evidence:[{messageId:'new',quote:'invented quote'}]}],focus:{question:'Number 9 date',evidence:[{messageId:'new',quote:'Tinggal nomor 9.'}]}},originals);
 expect(next.entries).toHaveLength(1);expect(next.entries[0]).toMatchObject({value:'A',state:'reported',evidence:[{messageId:'new',authorId:'unew',quote:'blood type A'}]});expect(next.focus?.question).toBe('Number 9 date');
 expect(mergeTeamProgress(next,undefined,[originals[0]]).entries).toHaveLength(0);
 const bad=mergeTeamProgress(undefined,{entries:[{item:'8',value:'A',evidence:[{messageId:'list',quote:'Ada Stone'}]},{item:'1',value:'White Hall',evidence:[{messageId:'list',quote:'Ada Stone'}]}]},[raw('list','1. Ada Stone\n2. White Hall\n8. O',4)]);
 expect(bad.entries).toHaveLength(0);
});
test('starter images keep their origin while being approved only for the current accessible thread',async()=>{
 const {turn,channel}=make(2);
 channel.parent={id:'123456789012345678',guildId:turn.guildId,permissionsFor:()=>({has:()=>true})};
 channel.fetchStarterMessage=async()=>({id:channel.id,channelId:channel.parent.id,guildId:turn.guildId,content:'Original CTF image',createdTimestamp:Date.now()-3600000,author:{id:'starter',username:'author',bot:false},attachments:new Map([['a',{name:'clue.png',url:'https://cdn.discordapp.com/attachments/123456789012345678/123456789012345679/clue.png',size:1024,contentType:'image/png'}]])});
 const result=await collectCTFInputs(turn,{text:''},new AbortController().signal);
 expect(result.images[0]).toMatchObject({channelId:turn.channelId,sourceChannelId:channel.parent.id,messageId:channel.id,authorId:'starter'});
});
test('CTF collection refreshes the thread instead of discarding older or post-summon teammates clues',async()=>{
 const {turn,rows}=make(120);rows.push({...rows[0],id:'900000000000000001',createdTimestamp:Date.now()-1000,content:'New finding after summon: only slot 9 remains.'});
 const result=await collectCTFInputs(turn,{text:'old compact history'},new AbortController().signal);
 expect(result.text).toContain('1. Ada Stone');expect(result.text).toContain('New finding after summon');expect(result.originals.some(m=>m.id==='900000000000000001')).toBe(true);
});
