"""No credentials or host commands: an HTTP-to-Unix bridge and sandbox entrypoint."""
import base64, http.client, http.server, json, os, pathlib, subprocess, sys, threading
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
        conn=UnixHTTP('gateway',timeout=80)
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
packet=json.loads(sys.stdin.buffer.readline(32*1024*1024))
root=pathlib.Path('/workspace');root.mkdir(exist_ok=True)
pathlib.Path('/tmp/codex').mkdir(mode=0o700,parents=True,exist_ok=True)
artifacts=[];images=[]
for index,artifact in enumerate(packet['artifacts']):
    name='A'+str(index+1)+'-'+''.join(c for c in artifact['name'] if c.isascii() and (c.isalnum() or c in '._-'))[-100:]
    path=root/name;path.write_bytes(base64.b64decode(artifact['data'],validate=True))
    artifacts.append({'path':str(path),'originalName':artifact['name'],'sourceMessageId':artifact['sourceMessageId']})
    if artifact['image'] and len(images)<4:images.append(str(path))
context={k:v for k,v in packet.items() if k not in ['artifacts','prompt','schema','model']};context['artifacts']=artifacts
(root/'context.json').write_text(json.dumps(context,ensure_ascii=False))
(root/'schema.json').write_text(json.dumps(packet['schema']))
(root/'tooling.txt').write_text('Python 3 standard library; gcc/g++; gdb; binutils (strings, readelf, objdump); file; ripgrep; unzip; jq; curl; sqlite3; pdftotext. No pip packages or network installs. Public search: POST http://127.0.0.1:8118/sources/search JSON {"query":"public clue"}, at most twice. Read cited or supplied sources: POST http://127.0.0.1:8118/sources/read JSON {"url":"public URL","query":"focus"}.\n')
server=http.server.ThreadingHTTPServer(('127.0.0.1',8118),Bridge)
threading.Thread(target=server.serve_forever,daemon=True).start()
args=['/usr/local/bin/codex','exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--color','never','--json','--dangerously-bypass-approvals-and-sandbox','--model',packet['model'],
 '-c','model_provider="hackerika"','-c','model_providers.hackerika.name="Hackerika job gateway"','-c','model_providers.hackerika.base_url="http://127.0.0.1:8118/v1"',
 '-c','model_providers.hackerika.wire_api="responses"','-c','model_providers.hackerika.requires_openai_auth=false','-c','model_providers.hackerika.supports_websockets=false',
 '-c','model_reasoning_effort="low"','-c','web_search="disabled"','-c','features.multi_agent=false',
 '--output-schema','/workspace/schema.json','--output-last-message','/workspace/final.json']
for image in images:args.extend(['--image',image])
# --image accepts multiple paths and otherwise consumes the positional prompt.
args.extend(['--',packet['prompt']])
try:
    code=subprocess.call(args,cwd='/workspace',env={**os.environ,'CODEX_HOME':'/tmp/codex'})
    final=root/'final.json'
    if final.is_file() and final.stat().st_size<=65536:
        print('HACKERIKA_FINAL:'+base64.b64encode(final.read_bytes()).decode(),flush=True)
    sys.exit(code)
finally:server.shutdown()
