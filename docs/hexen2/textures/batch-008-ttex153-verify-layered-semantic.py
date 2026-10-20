"""Actual layered153 pre-tier diagnostics; no production asset mutation.

Independent craft, wrapped polygon raster, plane composition, and neutral light.
Run with /usr/bin/python3; keeps a NEW probe receipt and isolated CLI replay.
"""
import ast,datetime,hashlib,io,json,math,pathlib,subprocess,tempfile
import numpy as np
from PIL import Image,ImageDraw
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
DIAG=ROOT/'docs/hexen2/textures/batch-008-ttex153-layered-semantic-diagnostics'
DIAG.mkdir(exist_ok=True)
OUT=DIAG/'probe.json';assert not OUT.exists(),'Preserve prior diagnostic receipt'
sha=lambda b:hashlib.sha256(b).hexdigest();watched={}
def read(p):
 p=pathlib.Path(p);p=p if p.is_absolute() else ROOT/p;p=p.resolve();data=p.read_bytes();watched[p]=data;return data
def load(p):return json.loads(read(p))
def witness(p):
 p=pathlib.Path(p);p=p if p.is_absolute() else ROOT/p;p=p.resolve();b=read(p)
 return dict(file=str(p.relative_to(ROOT)) if ROOT in p.parents else str(p),sha256=sha(b),bytes=len(b))
def math_functions(path,names,env):
 tree=ast.parse(read(path));definitions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[])
 exec(compile(definitions,str(path),'exec'),env);return env
report=dict(schemaVersion=1,startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
try:
 mp=BASE/'masters-layered/ttex153/master.json';meta=load(mp);recipe_path=BASE/'relief/ttex153-mortar.json';recipe=load(recipe_path)
 plan_path=ROOT/'docs/hexen2/textures/batch-008-ttex153-pre-tier-diagnostics/mortar-network-proposal.json';plan=load(plan_path)
 proofpath=ROOT/recipe['sourceVerification']['file'];proof=load(proofpath)
 assert sha(read(proofpath))==recipe['sourceVerification']['sha256']=='145edf09b788dcf4104662e1faf6aa42d8931cac6862c7b1529997d8738b83f9'
 assert proof['verdict'].startswith('PASS') and meta['layeredRelief']['recipe']==recipe
 assert recipe['nativeIdentity']==meta['layeredRelief']['nativeIdentity']==plan['nativeIdentity']=='b0d888d2faaedfc77346980aefcce52f620cabf34f80365bbbd17fd7835e10c6'
 assert recipe['name']==meta['name']=='ttex153' and recipe['edition']==meta['edition']=='portals'
 assert sha(read(plan_path))==recipe['plan']['sha256']=='476420c471cafae8b0017b220c63dc2d6df448abd45dd7e1ba769ffcde242ced'
 baseline_path=ROOT/recipe['sourceMasterPackage'];baseline=load(baseline_path)
 assert sha(read(baseline_path))==recipe['sourceMasterPackageSha256']==meta['masterRevision']['replacesUnqualifiedPackageSha256']
 assert proof['materials'][0]['masterPackage']['sha256']==sha(read(baseline_path))
 for role,row in meta['inputs'].items():assert sha(read(row['file']))==row['sha256']
 for role,row in meta['tools'].items():assert sha(read(row['file']))==row['sha256']
 for role in ('original','generated','prompt'):assert meta['inputs'][role]==baseline['inputs'][role]
 cp=mp.parent/'color.png';hp=mp.parent/'height.npy';rgbbytes=read(cp);heightbytes=read(hp)
 assert rgbbytes==read(baseline_path.parent/'color.png') and sha(rgbbytes)==recipe['authoringDiffuseSha256']==meta['color']['sha256']
 assert sha(heightbytes)==meta['height']['sha256'] and meta['generationCount']==1 and meta['height']['authoringPolicy']=='layered-veneer'
 rgb=np.array(Image.open(io.BytesIO(rgbbytes)));height=np.load(io.BytesIO(heightbytes),allow_pickle=False)
 assert rgb.shape==(512,512,3) and height.shape==(512,512) and height.dtype==np.dtype('float32')
 env=math_functions(ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py',{'blur','unit','extreme','smooth','craft64'},dict(np=np,math=math))
 detail=env['craft64'](rgb,meta['height']['profile'])
 assert np.array_equal(detail.astype('float32'),np.load(io.BytesIO(read(baseline_path.parent/'height.npy')),allow_pickle=False))
 layer=recipe['layering'];assert layer['referenceSize']==[64,64] and layer['brickRegions']==[dict(polygon=r['polygon']) for r in plan['regions']]
 assert {k:layer[k] for k in plan['planeProposal']}==plan['planeProposal']
 canvas=Image.new('L',(512,512));draw=ImageDraw.Draw(canvas)
 for region in layer['brickRegions']:
  for dy in (-512,0,512):
   for dx in (-512,0,512):draw.polygon([(x*8+dx,y*8+dy) for x,y in region['polygon']],fill=255)
 mask=np.asarray(canvas,dtype=float)/255;bevel=env['blur'](mask,layer['bevelPixels']*2)
 facing=layer['facingHeight']-(layer['facingHeight']-layer['chipFloor'])*np.minimum(bevel*2,1)
 composed=np.where(mask>.5,layer['brickHeight'],facing)+(detail-.5)*(2*layer['microAmplitude'])
 assert np.array_equal(composed.astype('float32'),height),'Independent full precision layered composition differs'
 stream=io.BytesIO();np.save(stream,composed.astype('float32'),allow_pickle=False);assert stream.getvalue()==heightbytes
 assert height[mask>.5].max()<height[mask<=.5].min()
 samples={}
 for label,row in plan['proposalWitnessClassifications'].items():
  x,y=row['nativeEdgeCoordinates'];px,py=round(x*8),round(y*8);values=height[py-3:py+4,px-3:px+4]
  assert bool(mask[py,px]>.5)==row['proposedLowerMask']
  samples[label]=dict(nativeEdgeCoordinates=[x,y],lowerMask=bool(mask[py,px]>.5),mean=float(values.mean()),median=float(np.median(values)),minimum=float(values.min()),maximum=float(values.max()))
 for j,a,b in [('J1','F1A','F1B'),('J2','F2A','F2B'),('J3','F3A','F3B')]:assert samples[j]['maximum']<min(samples[a]['minimum'],samples[b]['minimum'])
 for label in ('drip1','drip2','drip3'):assert not samples[label]['lowerMask'] and samples[label]['minimum']>height[mask>.5].max()
 normal_env=math_functions(ROOT/'docs/hexen2/textures/batch-008-pre-tier-semantic-probe.py',{'normals'},dict(np=np,math=math));normal=normal_env['normals'](height)
 annotated=Image.fromarray(rgb);a=np.array(annotated);border=(mask!=np.roll(mask,1,0))|(mask!=np.roll(mask,1,1));a[border]=[255,0,255];annotated=Image.fromarray(a);d=ImageDraw.Draw(annotated)
 for label,row in samples.items():
  x,y=[v*8 for v in row['nativeEdgeCoordinates']];d.ellipse((x-2,y-2,x+2,y+2),outline='yellow');d.text((x+3,y-9),label,fill='yellow',stroke_width=1,stroke_fill='black')
 panels=[annotated,Image.fromarray(np.rint(height*255).astype('uint8')).convert('RGB')]
 for light in (np.array([-.55,-.55,.63]),np.array([.55,.55,.63])):
  light/=np.linalg.norm(light);lum=.15+.75*np.clip(normal@light,0,1);panels.append(Image.fromarray(np.rint(lum*255).astype('uint8')).convert('RGB'))
 sheet=Image.new('RGB',(1024,1064));d=ImageDraw.Draw(sheet)
 for i,label in enumerate(['Actual unchanged RGB / actual lower mask boundary','Actual layered float height','Neutral NW lighting from actual successor','Neutral SE lighting from actual successor']):
  x=i%2*512;y=i//2*532;sheet.paste(panels[i],(x,y+20));d.text((x+3,y+4),label,fill='white')
 preview=DIAG/'actual-layered-semantic.png';sheet.save(preview)
 temporary=pathlib.Path(tempfile.mkdtemp(prefix='quaked-ttex153-layered-replay-',dir='/private/tmp'))
 command=['/usr/bin/python3',str(ROOT/'tools/texture_sheets/prepare_layered_texture_master.py'),'--recipe',str(recipe_path),'--output',str(temporary/'master')]
 result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True)
 command_result=dict(argv=command,exitCode=result.returncode,stdout=result.stdout,stderr=result.stderr)
 (temporary/'cli-result.json').write_text(json.dumps(command_result,indent=2)+'\n');assert result.returncode==0,result.stderr
 assert (temporary/'master/color.png').read_bytes()==rgbbytes and (temporary/'master/height.npy').read_bytes()==heightbytes and json.loads((temporary/'master/master.json').read_bytes())==meta
 assert all(p.read_bytes()==b for p,b in watched.items())
 report.update(verdict='PASS actual layered153 independent math/custody probe; visual decision separate',masterPackage=witness(mp),recipe=witness(recipe_path),plan=witness(plan_path),sourceMasterProof=witness(proofpath),RGBBytesUnchanged=True,independentFullPrecisionCompositionAndNPYBytesExact=True,actualLayeredCLIColorHeightPackageExact=True,actualCLIReplayDirectory=str(temporary),actualCLIProcess=command_result,maskRegions=17,maskedMasterPixels=int((mask>.5).sum()),mortarRange=[float(height[mask>.5].min()),float(height[mask>.5].max())],facingRange=[float(height[mask<=.5].min()),float(height[mask<=.5].max())],sourceClassifiedSamples=samples,preview=witness(preview),verifier=witness(pathlib.Path(__file__)),inputsStable=True,inputs=[witness(p) for p in sorted(watched)])
except Exception as exc:
 report.update(verdict='HOLD',error=repr(exc));raise
finally:
 report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x') as f:f.write(json.dumps(report,indent=2)+'\n')
 print(json.dumps(dict(receipt=str(OUT),verdict=report['verdict'],sha256=sha(OUT.read_bytes()))))
