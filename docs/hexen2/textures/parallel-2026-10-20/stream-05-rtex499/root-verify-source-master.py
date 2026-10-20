"""Independent unwarped source/master replay; pale-mark relief remains held."""
import ast, datetime, hashlib, io, json, math, pathlib, subprocess, tempfile
import numpy as np
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parents[5]
DOC = pathlib.Path(__file__).resolve().parent
BASE = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-05-rtex499'
OUT = DOC/'root-source-master-proof-v2.json'
assert not OUT.exists(), 'Preserve previous evidence'
watched = {}; sha = lambda b: hashlib.sha256(b).hexdigest()
def read(p):
    p=pathlib.Path(p); p=p if p.is_absolute() else ROOT/p
    p=p.resolve(); data=p.read_bytes(); watched[p]=data; return data
def load(p): return json.loads(read(p))
def witness(p):
    p=pathlib.Path(p); p=p if p.is_absolute() else ROOT/p; p=p.resolve()
    return {'file':str(p.relative_to(ROOT)) if ROOT in p.parents else str(p),'sha256':sha(read(p))}
report={'schemaVersion':1,'scope':'Independent source/master replay only; current pale feature relief and final tiers/art remain unaccepted.','materials':[]}
try:
    identity='4461c8b9623bcc682a41c4358b0e486c00aa3f77cde9b2dfebcb2efceab6dfd5'
    package=BASE/'masters/rtex499/master.json'; m=load(package)
    assert sha(read(package))=='2fe411c060670ed1bc1ddda7ec88d78282bc89cd366d383caca33ae4a0c19d8b'
    plan=load(DOC/'root-plan-review.json'); nativeproof=load(ROOT/'docs/evidence/hexen2-textures-2026-10-20/stream-05-rtex499/native-four-mips-flags.json')
    assert plan['verdict'].startswith('PASS') and nativeproof['nativeID']==identity
    assert nativeproof['allFourMipsEqualAllMapsAndCopies'] is True and nativeproof['ordinaryFlags'] is True
    assert nativeproof['provenance'] and all(row['texinfoFlags']==[0] for row in nativeproof['provenance'])
    native,=[v for v in load(ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json')['variants'] if v['id']==identity]
    item,=[i for i in load(BASE/'selection.json')['items'] if i['id']==identity]
    assert m['name']==item['name']=='rtex499' and m['edition']==item['edition']=='portals'
    assert m['generationCount']==item['generationCount']==1 and item['generationState']=='generated-retained'
    assert m['nativeDimensions']==[128,128] and m['masterDimensions']==[1024,1024] and m['canonicalMasterFactor']==8
    assert 'masterRevision' not in m and 'authoringPolicy' not in m['height']
    assert set(m['inputs'])=={'original','generated','prompt'}
    for group in ('inputs','tools'):
        for row in m[group].values(): assert sha(read(row['file']))==row['sha256']
    for role in ('original','generated','prompt'): assert m['inputs'][role]['sha256']==item[role+'Sha256']
    assert m['inputs']['original']['sha256']==plan['original']['sha256'] and m['inputs']['prompt']['sha256']==plan['prompt']['sha256']
    rawbytes=read(m['inputs']['generated']['file']); assert rawbytes==read(item['builtInOutput'])
    original=Image.open(io.BytesIO(read(m['inputs']['original']['file']))); raw=Image.open(io.BytesIO(rawbytes))
    assert original.size==(128,128) and sha(original.convert('RGBA').tobytes())==native['rgbaSha256']
    assert raw.size==(1254,1254) and raw.mode=='RGB'
    reg=m['registration']; assert (reg['method'],reg['factor'],reg['comparisonDivisor'],reg['colorStrength'],reg['fieldSigma'])==('photographic',8,2,.65,.75)
    assert reg['axis'] is None and reg['verticalLandmarks'] is None and not reg['edgeAnchor']
    source=np.asarray(original.convert('RGB'),dtype=float)
    donor=np.asarray(raw.resize((1024,1024),Image.Resampling.LANCZOS),dtype=float)
    delta=source.reshape(64,2,64,2,3).mean((1,3))-donor.reshape(64,16,64,16,3).mean((1,3))
    frequency=np.fft.fftfreq(64)[:,None]**2+np.fft.fftfreq(64)[None,:]**2
    field=np.fft.ifft2(np.fft.fft2(delta,axes=(0,1))*np.exp(-2*np.pi*np.pi*.75*.75*frequency)[:,:,None],axes=(0,1)).real
    channels=[]
    for k in range(3):
        tiled=np.tile(field[:,:,k],(3,3)).astype('float32')
        scaled=Image.fromarray(tiled,'F').resize((3072,3072),Image.Resampling.BICUBIC)
        channels.append(np.asarray(scaled)[1024:2048,1024:2048])
    rebuilt=np.rint(np.clip(donor+np.stack(channels,axis=2)*.65,0,255)).astype('uint8')
    rgbbytes=read(package.parent/'color.png'); heightbytes=read(package.parent/'height.npy')
    stream=io.BytesIO(); Image.fromarray(rebuilt,'RGB').save(stream,'PNG'); assert stream.getvalue()==rgbbytes
    oracle=ROOT/'docs/hexen2/textures/batch-008-first-four-verify-public-actual.py'; tree=ast.parse(read(oracle)); names={'blur','unit','extreme','smooth','craft64'}
    defs=ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[])
    context={'np':np,'math':math}; exec(compile(defs,str(oracle),'exec'),context)
    height=context['craft64'](rebuilt,m['height']['profile']).astype('float32')
    stream=io.BytesIO(); np.save(stream,height,allow_pickle=False); assert stream.getvalue()==heightbytes
    assert np.isfinite(height).all() and height.shape==(1024,1024) and 0<=height.min()<=height.max()<=1
    temp=pathlib.Path(tempfile.mkdtemp(prefix='quaked-rtex499-source-master-',dir='/private/tmp'))
    command=['/usr/bin/python3',str(ROOT/'tools/texture_sheets/prepare_texture_master.py')]
    for role,row in m['inputs'].items(): command+=['--'+role,row['file']]
    command+=['--name','rtex499','--edition','portals','--profile','stone','--color-strength','.65','--field-sigma','.75','--output',str(temp/'master')]
    result=subprocess.run(command,cwd=ROOT,text=True,capture_output=True)
    (temp/'result.json').write_text(json.dumps({'argv':command,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr},indent=2)+'\n')
    assert result.returncode==0,result.stderr
    assert (temp/'master/color.png').read_bytes()==rgbbytes and (temp/'master/height.npy').read_bytes()==heightbytes
    assert json.loads((temp/'master/master.json').read_bytes())==m
    watched.pop((BASE/'selection.json').resolve(),None)
    assert all(p.read_bytes()==b for p,b in watched.items())
    report.update(verdict='PASS source/master-only exact RGB/float/CLI replay; current pale-mark relief remains HOLD',materials=[{'nativeIdentity':identity,'name':'rtex499','edition':'portals','masterPackage':witness(package),'masterColor':witness(package.parent/'color.png'),'masterHeight':witness(package.parent/'height.npy'),'currentReliefArtAccepted':False}],verifier=witness(pathlib.Path(__file__)),inputs=[witness(p) for p in sorted(watched)],actualCLIReplayDirectory=str(temp),inputsStable=True)
except Exception as exc:
    report.update(verdict='HOLD',error=repr(exc)); raise
finally:
    report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with OUT.open('x') as f: f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'receipt':str(OUT),'verdict':report['verdict'],'sha256':sha(OUT.read_bytes())}))
