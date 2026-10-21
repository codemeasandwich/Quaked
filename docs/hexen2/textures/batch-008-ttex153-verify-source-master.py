"""Qualify ttex153 source/master replay only, retaining semantic-height HOLD.

Run /usr/bin/python3 docs/hexen2/textures/batch-008-ttex153-verify-source-master.py.
Source assets read-only; actual CLI replay goes to new private temporary scratch.
"""
import ast, datetime, hashlib, io, json, pathlib, runpy, subprocess, sys, tempfile
import PIL, numpy as np
from PIL import Image, features
ROOT=pathlib.Path(__file__).resolve().parents[3]
BASE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
OUT=ROOT/'docs/hexen2/textures/batch-008-ttex153-source-master-public-proof.json'
assert not OUT.exists(),'Preserve prior proof'
watched={};sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p):
 p=pathlib.Path(p);p=p if p.is_absolute() else ROOT/p;p=p.resolve();data=p.read_bytes();watched[p]=data;return data
def load(p):return json.loads(read(p))
def witness(p):
 p=pathlib.Path(p);p=p if p.is_absolute() else ROOT/p;p=p.resolve();data=read(p)
 return dict(file=str(p.relative_to(ROOT)) if ROOT in p.parents else str(p),sha256=sha(data),bytes=len(data))
REPORT=dict(schemaVersion=1,startedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),materials=[],scope='Independent source/master-only replay; current semantic relief remains HOLD. No tier art/runtime acceptance.')
try:
 identity='b0d888d2faaedfc77346980aefcce52f620cabf34f80365bbbd17fd7835e10c6'
 package=BASE/'masters/ttex153/master.json';master=load(package)
 nativeproof_path=ROOT/'docs/hexen2/textures/batch-008-public-source-proof.json';nativeproof=load(nativeproof_path)
 planpath=ROOT/'docs/hexen2/textures/batch-008-material-plan-v2-public-review.json';plan=load(planpath)
 native,=[m for m in nativeproof['materials'] if m['id']==identity];planned,=[m for m in plan['materials'] if m['id']==identity]
 selected,=[m for m in load(BASE/'selection.json')['items'] if m['id']==identity]
 assert nativeproof['verdict'].startswith('PASS') and plan['verdict'].startswith('PASS')
 assert master['name']==selected['name']=='ttex153' and master['edition']==selected['edition']=='portals'
 assert master['generationCount']==selected['generationCount']==1 and selected['generationState']=='generated-retained'
 assert master['canonicalMasterFactor']==8 and master['nativeDimensions']==[64,64] and master['masterDimensions']==[512,512]
 assert 'masterRevision' not in master and 'authoringPolicy' not in master['height']
 assert master['height']['authoredOnce'] and not master['height']['quantizedTo8Bit'] and master['height']['dtype']=='float32'
 assert set(master['inputs'])=={'original','generated','prompt'} and set(master['tools'])=={'prepare','finish','derive','craft'}
 for group in ('inputs','tools'):
  for role,row in master[group].items():assert sha(read(row['file']))==row['sha256']
 for role,key in [('original','originalSha256'),('generated','generatedSha256'),('prompt','promptSha256')]:
  assert sha(read(master['inputs'][role]['file']))==selected[key]
  assert pathlib.Path(master['inputs'][role]['file']).resolve()==(ROOT/selected[role]).resolve()
 assert master['inputs']['original']['sha256']==native['original']['sha256']==planned['original']['sha256']
 assert master['inputs']['prompt']['sha256']==planned['prompt']['sha256']
 rawbytes=read(master['inputs']['generated']['file']);assert rawbytes==read(selected['builtInOutput'])
 original=Image.open(io.BytesIO(read(master['inputs']['original']['file'])));raw=Image.open(io.BytesIO(rawbytes))
 assert original.format==raw.format=='PNG' and original.size==(64,64) and raw.size==(1254,1254) and raw.mode=='RGB'
 assert sha(original.convert('RGBA').tobytes())==native['rgbaSha256'] and np.array(original.convert('RGBA'))[:,:,3].min()==255
 original=original.convert('RGB')
 rgbpath=package.parent/master['color']['file'];heightpath=package.parent/master['height']['file']
 rgbbytes=read(rgbpath);heightbytes=read(heightpath);rgb=Image.open(io.BytesIO(rgbbytes));height=np.load(io.BytesIO(heightbytes),allow_pickle=False)
 assert rgb.format=='PNG' and rgb.mode=='RGB' and rgb.size==(512,512)
 assert sha(rgbbytes)==master['color']['sha256'] and sha(heightbytes)==master['height']['sha256']
 assert height.shape==(512,512) and height.dtype==np.dtype('float32') and np.isfinite(height).all() and 0<=height.min()<=height.max()<=1
 registration=master['registration'];assert registration['method']=='photographic' and registration['factor']==8 and registration['colorStrength']==.65 and registration['fieldSigma']==.75
 assert registration['comparisonDivisor']==2 and registration['axis'] is None and registration['verticalLandmarks'] is None and not registration['edgeAnchor']
 rgb_oracle_path=ROOT/'docs/hexen2/textures/batch-008-rtex306-verify-source-master.py';read(rgb_oracle_path)
 rebuilt=runpy.run_path(str(rgb_oracle_path))['independent_rgb'](original,raw)
 stream=io.BytesIO();Image.fromarray(rebuilt,'RGB').save(stream,'PNG');assert stream.getvalue()==rgbbytes
 # Load only independent math function definitions, never the first-four CLI.
 scalar_oracle_path=ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py'
 tree=ast.parse(read(scalar_oracle_path));names={'blur','unit','extreme','smooth','craft64'}
 definitions=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[])
 context=dict(np=np,math=__import__('math'));exec(compile(definitions,str(scalar_oracle_path),'exec'),context)
 scalar=context['craft64'](rebuilt,master['height']['profile']).astype('float32')
 assert np.array_equal(scalar,height);stream=io.BytesIO();np.save(stream,scalar,allow_pickle=False);assert stream.getvalue()==heightbytes
 temp=pathlib.Path(tempfile.mkdtemp(prefix='quaked-ttex153-source-master-',dir='/private/tmp'))
 command=['/usr/bin/python3',str(ROOT/'tools/texture_sheets/prepare_texture_master.py')]
 for role,row in master['inputs'].items():command+=['--'+role,row['file']]
 command+=['--name','ttex153','--edition','portals','--profile','stone','--color-strength','.65','--field-sigma','.75','--output',str(temp/'master')]
 result=subprocess.run(command,cwd=ROOT,text=True,capture_output=True)
 (temp/'actual-cli-result.json').write_text(json.dumps(dict(argv=command,exitCode=result.returncode,stdout=result.stdout,stderr=result.stderr),indent=2)+'\n')
 assert result.returncode==0,result.stderr
 assert (temp/'master/color.png').read_bytes()==rgbbytes and (temp/'master/height.npy').read_bytes()==heightbytes and json.loads((temp/'master/master.json').read_bytes())==master
 points=dict(J1=[22,10],F1A=[22,6],F1B=[22,15],J2=[42,28.5],F2A=[42,25],F2B=[42,32],J3=[37,46.5],F3A=[37,43],F3B=[37,51])
 samples={}
 for label,(x,y) in points.items():
  px,py=round(x*8),round(y*8);values=height[py-3:py+4,px-3:px+4]
  samples[label]=dict(nativeEdgeCoordinates=[x,y],masterPixel=[px,py],mean=float(values.mean()),median=float(np.median(values)),minimum=float(values.min()),maximum=float(values.max()))
 assert samples['J1']['mean']>max(samples['F1A']['mean'],samples['F1B']['mean'])
 assert samples['J2']['mean']>max(samples['F2A']['mean'],samples['F2B']['mean'])
 assert samples['J3']['mean']>max(samples['F3A']['mean'],samples['F3B']['mean'])
 # selection.json is live; bind this selected row rather than other progressing rows.
 live=json.loads((BASE/'selection.json').read_bytes());current,=[m for m in live['items'] if m['id']==identity];assert current==selected
 watched.pop((BASE/'selection.json').resolve(),None)
 assert all(p.read_bytes()==b for p,b in watched.items())
 REPORT.update(verdict='PASS source/master-only exact replay; current pale-mortar relief semantics HOLD',
  materials=[dict(nativeIdentity=identity,name='ttex153',edition='portals',masterPackage=witness(package),original=witness(master['inputs']['original']['file']),raw=witness(master['inputs']['generated']['file']),prompt=witness(master['inputs']['prompt']['file']),masterColor=witness(rgbpath),masterHeight=witness(heightpath),independentRGBPNGBytesExact=True,independentFloat32NPYBytesExact=True,actualCLIColorHeightPackageExact=True,currentReliefArtAccepted=False,finalArtAccepted=False,sourceClassifiedHeightSamples=samples)],
  nativeProof=witness(nativeproof_path),reviewedMaterialPlan=witness(planpath),verifier=witness(pathlib.Path(__file__)),actualCLIReplayDirectory=str(temp),
  materialObservation='Viewed actual native, retained1254px raw and512px master RGB. Plausible weathered ochre limestone faces, fine mineral/chip structure and granular pale lime mortar. Real material structure is present; source is not abstract noise.',
  semanticFinding='Physical pale joint centres J1/J2/J3 are locally raised above neighboring limestone face patches. Source/master replay is correct, but brightness-based craft produced the wrong physical hierarchy. HOLD until reviewed semantic composition and actual lighting pass.',
  limits=['PASS scopes source/master custody and mathematical replay only, deliberately excluding current relief/art acceptance.','The prior full native/four-mip proof is bound and reused; no new native alias or all-occurrence audit.','No tier encoding, generation, recipe/master/map/catalog/Git edits.','ActualCLI writes isolated diagnostic replay only; retained production master stays unchanged.'],
  codec=dict(executable=sys.executable,Python=sys.version,Pillow=PIL.__version__,NumPy=np.__version__,WebP=features.version('webp')),inputsStable=True,inputs=[witness(p) for p in sorted(watched)])
except Exception as exc:
 REPORT.update(verdict='HOLD',error=repr(exc));raise
finally:
 REPORT['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with OUT.open('x') as f:f.write(json.dumps(REPORT,indent=2)+'\n')
 print(json.dumps(dict(receipt=str(OUT),verdict=REPORT['verdict'],sha256=sha(OUT.read_bytes()))))
