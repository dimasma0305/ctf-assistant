"""No credentials or host commands: an HTTP-to-Unix bridge and sandbox entrypoint."""
import base64, http.client, http.server, json, os, pathlib, re, resource, selectors, shutil, socket, socketserver, stat, subprocess, sys, threading, time
class UnixHTTP(http.client.HTTPConnection):
    def connect(self):
        import socket
        self.sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        self.sock.connect('/run/inference.sock')
class Bridge(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def log_message(self,*args): pass
    def do_POST(self):
        length=int(self.headers.get('Content-Length','0'))
        if length<1 or length>32*1024*1024:
            self.send_error(413);return
        conn=UnixHTTP('gateway',timeout=None)
        try:
            conn.request('POST',self.path,body=self.rfile.read(length),headers={'Content-Type':'application/json'})
            response=conn.getresponse();self.send_response(response.status)
            self.send_header('Content-Type',response.getheader('Content-Type','application/json'));self.send_header('Connection','close');self.end_headers()
            while True:
                data=response.read1(8192)
                if not data:break
                self.wfile.write(data);self.wfile.flush()
        except Exception: pass
        finally:conn.close();self.close_connection=True
class EgressRelay(socketserver.BaseRequestHandler):
    def handle(self):
        upstream=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        try:
            upstream.connect('/run/egress.sock')
            with selectors.DefaultSelector() as selector:
                selector.register(self.request,selectors.EVENT_READ,upstream)
                selector.register(upstream,selectors.EVENT_READ,self.request)
                while True:
                    for key,_ in selector.select(timeout=50):
                        chunk=key.fileobj.recv(65536)
                        if not chunk:return
                        key.data.sendall(chunk)
        except (OSError,TimeoutError):pass
        finally:upstream.close()
class EgressServer(socketserver.ThreadingTCPServer):
    allow_reuse_address=True
    daemon_threads=True
packet=json.loads(sys.stdin.buffer.readline(32*1024*1024))
root=pathlib.Path('/workspace');root.mkdir(exist_ok=True)
(root/'exports').mkdir(mode=0o700,exist_ok=True)
pathlib.Path('/tmp/codex').mkdir(mode=0o700,parents=True,exist_ok=True)
shutil.copytree('/opt/irai-skills',root/'.agents'/'skills',dirs_exist_ok=True)
artifacts=[];images=[]
for index,artifact in enumerate(packet['artifacts']):
    name='A'+str(index+1)+'-'+''.join(c for c in artifact['name'] if c.isascii() and (c.isalnum() or c in '._-'))[-100:]
    path=root/name;path.write_bytes(base64.b64decode(artifact['data'],validate=True))
    artifacts.append({'path':str(path),'originalName':artifact['name'],'sourceMessageId':artifact['sourceMessageId']})
    if artifact['image'] and len(images)<4:images.append(str(path))
context={k:v for k,v in packet.items() if k not in ['artifacts','prompt','schema','model']};context['artifacts']=artifacts
(root/'context.json').write_text(json.dumps(context,ensure_ascii=False))
(root/'schema.json').write_text(json.dumps(packet['schema']))
(root/'tooling.txt').write_text('Python 3 standard library; gcc/g++; gdb; binutils (strings, readelf, objdump); make; autoconf; bison; re2c; pkg-config; PHP build libraries; file; ripgrep; unzip; jq; curl; git; sqlite3; pdftotext; ffmpeg/ffprobe for video inspection and MP4 conversion; rsvg-convert for rasterizing a code-drawn SVG comic to PNG when generative image API is unavailable. Public TCP internet is available via the bounded SOCKS5 proxy configured for curl and git HTTPS; private and loopback targets are blocked. No reusable credentials are supplied. The reviewed irai skills ctf-deep-solve and resourceful-solve are available under /workspace/.agents/skills; select a relevant skill and read its SKILL.md and only needed references. Internet access does not grant permission to test unrelated targets or access private Discord, credentials, or server systems. Ask Hackerika for same-thread or same-channel Discord evidence: POST http://127.0.0.1:8118/discord/read JSON {"kind":"recent","limit":20,"includeImage":true,"describeImage":true} or {"kind":"message","messageId":"snowflake","includeImage":true,"describeImage":true}. Images arrive as base64 in images[].data; decode to /workspace. To resume work on a file previously attached by Hackerika in this same channel/thread, POST http://127.0.0.1:8118/discord/file JSON {"messageId":"bot message snowflake","fileName":"exact filename"}; save the binary response to /workspace and check the HTTP status before use. Only a bounded prior attachment sent by Hackerika is retrievable. imageObservation describes actual pixels via Luna vision; use it instead of guessing from metadata or ASCII art. For a requested creative illustration, POST JSON {"prompt":"complete visual description"} to http://127.0.0.1:8118/images/generate and save the binary WebP response under /workspace/exports/; errors are JSON, not images. If image API is unavailable, a code-drawn SVG comic rasterized with rsvg-convert can still fulfill a stylized illustration request; verify the resulting PNG. Do not claim success unless the file exists. Public search: POST http://127.0.0.1:8118/sources/search JSON {"query":"public clue"}. Read cited or supplied sources: POST http://127.0.0.1:8118/sources/read JSON {"url":"public URL","query":"focus"}. The application imposes no count quota on model calls, searches, source reads, public downloads, or permission-checked same-channel Discord reads; keep working until the objective is resolved or a concrete blocker remains. For static slide sites, follow linked JS slide chunks; download a discovered public archive with POST http://127.0.0.1:8118/sources/download JSON {"url":"inspected archive URL"} and save the binary response to /workspace before inspecting it. Hackerika can steer this live job. New follow-up messages are injected at inference boundaries; after a candidate final answer, POST {} to http://127.0.0.1:8118/manager/steering and resume the same session when updates are returned. If the user asks for a file, write up to two finished files under /workspace/exports/ with simple ASCII names. Each file must be <=4 MiB and the combined size <=6 MiB. Only top-level regular files are exported; the host sends them as Discord attachments in the original channel/thread. Do not put secrets, private Discord context, or unrequested source artifacts in exports.\n')
server=http.server.ThreadingHTTPServer(('127.0.0.1',8118),Bridge)
threading.Thread(target=server.serve_forever,daemon=True).start()
egress=EgressServer(('127.0.0.1',8119),EgressRelay)
threading.Thread(target=egress.serve_forever,daemon=True).start()
proxy_env={'ALL_PROXY':'socks5h://127.0.0.1:8119','all_proxy':'socks5h://127.0.0.1:8119',
           'HTTP_PROXY':'socks5h://127.0.0.1:8119','http_proxy':'socks5h://127.0.0.1:8119',
           'HTTPS_PROXY':'socks5h://127.0.0.1:8119','https_proxy':'socks5h://127.0.0.1:8119',
           'NO_PROXY':'127.0.0.1,localhost','no_proxy':'127.0.0.1,localhost'}
provider_args=['-c','model_provider="hackerika"','-c','model_providers.hackerika.name="Hackerika job gateway"','-c','model_providers.hackerika.base_url="http://127.0.0.1:8118/v1"',
 '-c','model_providers.hackerika.wire_api="responses"','-c','model_providers.hackerika.requires_openai_auth=false','-c','model_providers.hackerika.supports_websockets=false',
 '-c','model_reasoning_effort="xhigh"','-c','web_search="disabled"','-c','features.multi_agent=true']
args=['/usr/local/bin/codex','exec','--ignore-user-config','--ignore-rules','--skip-git-repo-check','--color','never','--json','--dangerously-bypass-approvals-and-sandbox','--model',packet['model'],
 *provider_args,
 '--output-schema','/workspace/schema.json','--output-last-message','/workspace/final.json']
for image in images:args.extend(['--image',image])
# --image accepts multiple paths and otherwise consumes the positional prompt.
args.extend(['--',packet['prompt']])
try:
    # Crash reproducers can accidentally emit unbounded sanitizer logs. Keep
    # individual files below a quarter of the disposable workspace.
    resource.setrlimit(resource.RLIMIT_FSIZE,(256*1024*1024,256*1024*1024))
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    started=time.monotonic()
    environment={**os.environ,**proxy_env,'CODEX_HOME':'/tmp/codex'}
    code=subprocess.call(args,cwd='/workspace',env=environment)
    final=root/'final.json'
    # Subscription/provider streams can occasionally close after substantial
    # work. Resume the same local Codex session instead of discarding all
    # evidence. Bound only consecutive transport recovery attempts so a
    # persistent outage still terminates and can be reported honestly.
    recovery_attempts=0
    while code!=0 and recovery_attempts<3:
        recovery_attempts+=1;final.unlink(missing_ok=True);time.sleep(recovery_attempts)
        recovery=['/usr/local/bin/codex','exec','resume','--last','--ignore-user-config','--ignore-rules','--skip-git-repo-check','--json',
            '--dangerously-bypass-approvals-and-sandbox','--model',packet['model'],*provider_args,
            '--output-schema','/workspace/schema.json','--output-last-message','/workspace/final.json','--',
            'The previous inference transport was interrupted. Continue the same objective from the evidence and local files already in this session. Do not restart completed research. Produce the strongest evidence-backed final JSON, or continue the remaining concrete work.']
        code=subprocess.call(recovery,cwd='/workspace',env=environment)
    final_bytes=final.read_bytes() if final.is_file() and final.stat().st_size<=65536 else None
    def manager_updates():
        connection=http.client.HTTPConnection('127.0.0.1',8118,timeout=20)
        try:
            connection.request('POST','/manager/steering',body='{}',headers={'Content-Type':'application/json'})
            response=connection.getresponse()
            parsed=json.loads(response.read(1024*1024)) if response.status==200 else {}
            return parsed.get('updates',[]) if isinstance(parsed,dict) and isinstance(parsed.get('updates',[]),list) else []
        except Exception:return []
        finally:connection.close()
    seen_steps=set()
    while True:
        if code!=0 or not final_bytes:break
        try: next_step=json.loads(final_bytes).get('nextStep','')
        except (ValueError,TypeError):break
        updates=manager_updates()
        if updates:
            step='\n'.join(str(item.get('instruction','')).strip() for item in updates if isinstance(item,dict) and str(item.get('instruction','')).strip())
            key='steer:'+','.join(str(item.get('id','')) for item in updates if isinstance(item,dict))
            resume_instruction='The original Discord requestor sent this live follow-up: '+json.dumps(step)+'. Treat it as the latest user direction within the existing scope. '
        else:
            if not isinstance(next_step,str) or not next_step.strip() or len(next_step)>200:break
            step=next_step.strip();key='next:'+step.casefold()
            resume_instruction='The previous answer identified one possible next action: '+json.dumps(step)+'. '
        if not step or key in seen_steps:break
        seen_steps.add(key)
        # Keep the same disposable Codex thread so follow-ups and evidence
        # steps retain the exact local state produced earlier in this job.
        final.unlink(missing_ok=True)
        resume=['/usr/local/bin/codex','exec','resume','--last','--ignore-user-config','--ignore-rules','--skip-git-repo-check','--json',
            '--dangerously-bypass-approvals-and-sandbox','--model',packet['model'],*provider_args,
            '--output-schema','/workspace/schema.json','--output-last-message','/workspace/final.json','--',
            'Continue the same objective. '+resume_instruction+
            'Check whether it is still useful and within scope, then perform it if feasible. Do not repeat exhausted paths. '
            'Return the strongest evidence-backed final JSON. Set nextStep only for a different concrete untried action; otherwise use an empty string.']
        resumed=subprocess.call(resume,cwd='/workspace',env=environment)
        if resumed!=0 or not final.is_file() or final.stat().st_size>65536:break
        candidate=final.read_bytes()
        try:
            result=json.loads(candidate)
            if not isinstance(result,dict) or not isinstance(result.get('summary'),str) or not result['summary'].strip() \
                or not all(isinstance(result.get(key),list) for key in ('flags','findings','unresolved')):break
        except (ValueError,TypeError):break
        final_bytes=candidate
    if final_bytes:
        print('HACKERIKA_FINAL:'+base64.b64encode(final_bytes).decode(),flush=True)
        if code==0:
            total=0;count=0
            for item in sorted((root/'exports').iterdir()):
                info=item.lstat()
                if not stat.S_ISREG(info.st_mode) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}',item.name) or '..' in item.name:
                    continue
                if info.st_size<1 or info.st_size>4*1024*1024 or total+info.st_size>6*1024*1024:
                    continue
                data=item.read_bytes()
                if len(data)!=info.st_size:continue
                total+=len(data)
                print('HACKERIKA_FILE:'+json.dumps({'name':item.name,'data':base64.b64encode(data).decode()},separators=(',',':')),flush=True)
                count+=1
                if count>=2 or total>=6*1024*1024:break
    sys.exit(code)
finally:server.shutdown();egress.shutdown()
