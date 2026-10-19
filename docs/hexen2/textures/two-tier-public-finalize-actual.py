"""Complete first actual40-map proof from retained passed checks plus exact source custody.
No repeated map encoding. Parent owns the existing HTTP preview server.
"""
import datetime,hashlib,json,pathlib,sys,subprocess,urllib.request,urllib.parse,re
from html.parser import HTMLParser
import numpy as np
ROOT=pathlib.Path(__file__).resolve().parents[3];BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19'
OUT=ROOT/'docs/hexen2/textures/two-tier-actual-public-verification.json';assert not OUT.exists()
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_text())
def w(p):
 b=p.read_bytes();return {'file':str(p.relative_to(ROOT)),'sha256':sha(b),'bytes':len(b)}
def pin(row):
 p=ROOT/row['file'];assert sha(p.read_bytes())==row['sha256']and p.stat().st_size==row['bytes'];return p
priorpath=ROOT/'docs/hexen2/textures/two-tier-public-actual-artifacts.json';prior=load(priorpath)
assert prior['verdict']=='HOLD'and prior['error']=='AssertionError()'and len(prior['materials'])==4
batchpath=BASE/'tiers/batch.json';batch=load(batchpath);heldInputs=[priorpath,batchpath,pathlib.Path(__file__),ROOT/'tests/hexen2_texture_tiers_test.py',ROOT/'tools/texture_sheets/derive_texture_tiers.py',ROOT/'tools/craft_normals.py',BASE/'prepare_single_masters.py',BASE/'tiers/index.html']
count=0
for m in prior['materials']:
 item=next(i for i in batch['items']if i['name']==m['name']);assert item['nativeIdentity']==m['nativeIdentity']
 for key in ['singleMaster','retainedGPTSource','prompt','tierReceipt']:heldInputs.append(pin(m[key]))
 package=load(ROOT/m['singleMaster']['file']);receipt=load(ROOT/m['tierReceipt']['file'])
 assert sha((BASE/item['masterPackage']).read_bytes())==item['masterPackageSha256']==m['singleMaster']['sha256']
 assert sha((BASE/item['tierReceipt']).read_bytes())==item['tierReceiptSha256']==m['tierReceipt']['sha256']
 for k in ['color','height']:
  p=ROOT/package[k]['file'];assert sha(p.read_bytes())==package[k]['sha256'];heldInputs.append(p)
 for p,h in {**package['inputs'],**package['tools']}.items():assert sha((ROOT/p).read_bytes())==h;heldInputs.append(ROOT/p)
 assert receipt['tools']['deriverSha256']==batch['toolSha256']==sha((ROOT/'tools/texture_sheets/derive_texture_tiers.py').read_bytes())
 for tier in m['tiers']:
  assert tier['allFiveQ92BytesExact']is True
  for row in tier['maps']:heldInputs.append(pin(row));count+=1
assert count==40
# Original immutable golden fixture lacked profile metadata; explicit coordinator
# clarification supplies the exact old profile without altering that old receipt.
sys.path.insert(0,str(ROOT/'tools'));from craft_normals import craft,profile_for
prepath=ROOT/'docs/hexen2/textures/craft-default-prechange.json';prespath=ROOT/'docs/hexen2/textures/craft-default-preservation.json';pre,pres=load(prepath),load(prespath)
assert sha(prepath.read_bytes())==pres['prechangeReceiptSHA256']and pres['currentSourceSHA256']==sha((ROOT/'tools/craft_normals.py').read_bytes())
y,x=np.mgrid[:64,:128];rgb=np.stack(((x*7+y*11)%251/255,(x*3+y*2)%233/255,(x*13+y*5)%199/255),axis=2);profile={**profile_for('stone'),'strength':.3,'cap':.5};h,n=craft(rgb,profile)
assert sha(h.tobytes())==pre['heightSHA256']==pres['heightSHA256']and sha(n.tobytes())==pre['normalSHA256']==pres['normalSHA256']
heldInputs += [prepath,prespath]
# Execute actual shipped preview JavaScript through its DOM-facing interfaces in
# a bounded fixture; real browser art/appearance review remains separate.
htmlpath=BASE/'tiers/index.html';html=htmlpath.read_text();script=re.search(r'<script>(.*?)</script>',html,re.S).group(1)
materials=json.loads(re.search(r'const materials=(.*?);\s*function selectTier',script,re.S).group(1))
assert len(materials)==4 and '<option value="Mid" selected>'in html
vm=r'''import vm from 'node:vm';let raw='';for await(const c of process.stdin)raw+=c;const data=JSON.parse(raw),states={},callbacks={};const quality={value:'Mid',addEventListener:(event,fn)=>callbacks[event]=fn};const nodes=new Map(data.materials.map(m=>[m.name,new Map()]));const document={querySelector(selector){if(selector==='#quality')return quality;const name=selector.match(/data-material="([^"]+)"/)[1];return {querySelector(s){let n=nodes.get(name);if(!n.has(s))n.set(s,{style:{},src:'',hidden:false,textContent:''});return n.get(s);}};}};const context=vm.createContext({document});vm.runInContext(data.script,context,{timeout:1000});function record(k){states[k]=Object.fromEntries([...nodes].map(([name,n])=>[name,Object.fromEntries(n)]));states[k]=JSON.parse(JSON.stringify(states[k]));}record('Mid');for(const tier of ['Low','High']){quality.value=tier;callbacks.change();record(tier);}process.stdout.write(JSON.stringify(states));'''
node='/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
r=subprocess.run([node,'--input-type=module','-e',vm],input=json.dumps({'script':script,'materials':materials}),text=True,capture_output=True,timeout=10);assert r.returncode==0,r.stderr;states=json.loads(r.stdout)
urls=set(['index.html'])
class References(HTMLParser):
 def handle_starttag(self,tag,attrs):
  for k,v in attrs:
   if k in ('src','href')and v:urls.add(v)
p=References();p.feed(html)
for material in materials:
 item=next(i for i in batch['items']if i['name']==material['name']);assert material['native']==[item['nativeIdentity']['width'],item['nativeIdentity']['height']]
 for tier in ['Low','Mid','High']:
  expected='../'+item['original']if tier=='Low'else pathlib.PurePosixPath(item['tiers'][tier]['files']['diffuse']).relative_to('tiers').as_posix()
  assert material[tier]==expected;state=states[tier][item['name']]
  assert state['.selected']['src']==expected and expected in state['.repeat']['style']['backgroundImage'];urls.add(expected)
  assert state['.low-note']['hidden']==(tier!='Low')and state['.distance']['hidden']==(tier=='Low')and state['.relief']['hidden']==(tier=='Low')
  factor={'Low':1,'Mid':4,'High':8}[tier];assert state['.dimensions']['textContent']==tier+' · '+str(material['native'][0]*factor)+' × '+str(material['native'][1]*factor)
  if tier!='Low':urls.add(state['.distance']['src']);urls.add(state['.relief']['src'])
 for row in item['tiers'].values():
  for path in row['files'].values():urls.add(pathlib.PurePosixPath(path).relative_to('tiers').as_posix())
 urls.add('../'+item['masterPackage'])
before={str(p):sha(p.read_bytes())for p in heldInputs};opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));requests=[];baseurl='http://127.0.0.1:53999/tiers/'
for ref in sorted(urls):
 url=urllib.parse.urljoin(baseurl,ref);parsed=urllib.parse.urlparse(url);assert parsed.scheme=='http'and parsed.netloc=='127.0.0.1:53999'
 p=(BASE/urllib.parse.unquote(parsed.path).lstrip('/')).resolve();assert p.is_relative_to(BASE.resolve())and p.is_file()
 with opener.open(url,timeout=5)as response:
  b=response.read(8*1024*1024);assert response.status==200 and b==p.read_bytes()
 requests.append({'url':url,'status':200,**w(p)})
assert all(sha(pathlib.Path(p).read_bytes())==digest for p,digest in before.items())
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT,timeout=15,env={**__import__('os').environ,'GIT_OPTIONAL_LOCKS':'0'})
isolation=[]
for p in ['assets/game/textures/index.json','assets/layout.json','tools/distribution/manifest.mjs']:
 assert (ROOT/p).read_bytes()==git('show','HEAD:'+p);isolation.append(w(ROOT/p))
record={'schemaVersion':1,'verdict':'PASS actual40-map master/codec/math plus public preview; art and runtime acceptance separate','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actualMapCount':count,'retainedInitialHold':w(priorpath),'initialHoldResolution':'All4master and40map checks had completed. Final golden reconstruction omitted unrecorded strength/cap overrides; exact coordinator profile supplied and matched retained old hashes. No map/producer changes or repeated encoding were needed.','goldenClarifiedProfile':profile,'historicalGolden':{'prechange':w(prepath),'preservation':w(prespath),'heightSHA256':sha(h.tobytes()),'normalSHA256':sha(n.tobytes())},'materials':prior['materials'],'inputCustodyStable':True,'inputs':[w(p)for p in dict.fromkeys(heldInputs)],'runtimeIsolation':isolation,'publicPreview':{'rootOwnedServer':'http://127.0.0.1:53999/tiers/index.html','html':w(htmlpath),'default':'Mid','DOMInterfaceFixture':{'verdict':'PASS actual inline JavaScript initialMid plus Low/High change handlers','states':states,'scope':'bounded Node vm DOM fixture; not browser visual acceptance'},'GETs':requests,'serverDisposition':'Existing coordinator-owned server left untouched'},'limits':prior['limits']+['Actual generator service call count is not independently inspected; old2 retained raw-source hashes match prior proof, and each new source package binds1single generation output shared by both tiers.','No browser/game launch by this verifier. Coordinator separately owns real browser UI and visual review.','Public numeric replay occurred in the retained initial-HOLD receipt; current complete graph hashes remain identical and the only remaining golden-input ambiguity is resolved above.']}
OUT.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(w(OUT)))
