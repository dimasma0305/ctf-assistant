import { expect, test } from 'bun:test';

for (const mode of ['native-search', 'unsupported-search-claim', 'chat-tools-and-image']) {
    test(`ChatGPT provider integration: ${mode}`, async () => {
        const scenario = `
import assert from 'node:assert/strict';
Math.random=()=>0.5;
const mode=${JSON.stringify(mode)};
const requests=[];let apiCalls=0;
const done=output=>new Response('data: '+JSON.stringify({type:'response.completed',response:{id:'r',status:'completed',output}})+'\\n\\n',{headers:{'Content-Type':'text/event-stream'}});
globalThis.fetch=async(input,init={})=>{
 const url=String(input?.url||input);
 if(url.startsWith('https://cdn.discordapp.com/attachments/'))return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=','base64'),{headers:{'Content-Type':'image/png'}});
 assert.equal(url,'https://api.openai.com/v1/responses','no DeepSeek request or paid fallback');
 const request=JSON.parse(init.body);requests.push(request);apiCalls++;assert.equal(request.store,false);assert.equal(request.stream,true);assert.equal(request.model,'gpt-6-luna');
 if(mode!=='chat-tools-and-image')return done([...(mode==='native-search'?[{type:'web_search_call',status:'completed'}]:[]),{type:'message',content:[{type:'output_text',text:'fixture evidence',annotations:[{type:'url_citation',title:'Primary source',url:'https://example.com/docs?v=4&token=PRIVATE-SECRET'}]}]}]);
 assert(request.input.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='input_image'&&p.image_url.startsWith('data:image/png;base64,'))));
 if(apiCalls===1)return done([{id:'rs',type:'reasoning',summary:[],encrypted_content:'OPAQUE'},{type:'function_call',namespace:'hackerika',call_id:'clock-call',name:'get_current_time',arguments:'{}'}]);
 assert(request.input.some(m=>m.type==='function_call_output'&&m.call_id==='clock-call'));assert(request.input.some(m=>m.type==='reasoning'&&m.encrypted_content==='OPAQUE'));
 return done([{type:'message',phase:'commentary',content:[{type:'output_text',text:'INTERNAL-PREFACE'}]},{type:'message',phase:'final_answer',content:[{type:'output_text',text:'siap, gambarnya masuk'}]}]);
};
const {getChatGPTClient}=await import('./src/Services/AI/chatgptClient.ts');getChatGPTClient().auth.credentials=async()=>({access_token:'fixture-no-network'});
if(mode!=='chat-tools-and-image'){
 const {webSearchForTool}=await import('./src/Services/AI/web.ts');const result=await webSearchForTool({query:'current documentation'});
 if(mode==='native-search'){assert(result.ok);assert.equal(result.provider,'chatgpt-native');assert.equal(result.results[0].url,'https://example.com/docs?v=4');assert(!JSON.stringify(result).includes('PRIVATE-SECRET'));}
 else {assert.equal(result.ok,false);assert.equal(result.error,'native_search_not_used');}
 assert.equal(apiCalls,1);
}else{
 const {Collection}=await import('discord.js');const db=await import('./src/Database/connect.ts');
 const q=v=>({sort(){return this},limit(){return this},select(){return this},setOptions(){return this},maxTimeMS(){return this},lean:async()=>v,exec:async()=>v,then(a,b){return Promise.resolve(v).then(a,b)}});
 for(const m of Object.values(db))if(m?.modelName){m.find=()=>q([]);m.findOne=()=>q(null);m.findOneAndUpdate=()=>q(null);m.updateOne=()=>q({matchedCount:1});}
 db.BotStateModel.findOneAndUpdate=()=>q({mood:'calm',energy:70});
 const sends=[];const caller='111111111111111111',bot='1077393568647352320';
 const guild={id:'555555555555555555',name:'Fixture',members:{me:{id:bot},cache:new Collection(),fetch:async()=>new Collection()},roles:{cache:new Collection()},emojis:{cache:new Collection()}};
 const channel={id:'700000000000000001',name:'general',type:0,sendTyping:async()=>{},send:async p=>{sends.push(p.content);return {id:'sent'}},messages:{fetch:async()=>new Collection()}};
 const msg={id:'800000000000000001',content:'jam berapa dan lihat ini',author:{id:caller,username:'Dimas'},channelId:channel.id,channel,guild,guildId:guild.id,createdTimestamp:Date.now(),attachments:new Collection([['image',{name:'pixel.png',size:68,contentType:'image/png',url:'https://cdn.discordapp.com/attachments/700000000000000001/600000000000000001/pixel.png'}]]),embeds:[],mentions:{users:new Collection([[bot,{id:bot,username:'Hackerika',bot:true}]]),members:new Collection()},reply:async p=>channel.send(p)};
 const {handleAIChat}=await import('./src/Services/AI/chat.ts');await handleAIChat(msg,{user:{id:bot}},{addressed:true});
 assert.equal(apiCalls,2);assert.deepEqual(sends,['siap, gambarnya masuk']);
}
console.log('CHATGPT_INTEGRATION_OK');process.exit(0);
`;
        const child = Bun.spawn([process.execPath, '-e', scenario], { cwd: process.cwd(), env: { ...process.env,
            NODB: 'true', AI_PROVIDER: 'chatgpt', CHATGPT_MODEL: 'gpt-6-luna', AI_CHAT_MODEL: 'gpt-6-luna', AI_VISION_MODEL: 'gpt-6-luna', AI_RESEARCH_MODEL: 'gpt-6-luna', AI_JUDGE_MODEL: 'gpt-6-luna',
            OPENAI_API_KEY: '', CF_WORKER_URL: '', CF_WORKER_TOKEN: '' }, stdout: 'pipe', stderr: 'pipe' });
        const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        expect({ code, stderr: code ? stderr : '' }).toEqual({ code: 0, stderr: '' }); expect(stdout).toContain('CHATGPT_INTEGRATION_OK');
    }, 20_000);
}
