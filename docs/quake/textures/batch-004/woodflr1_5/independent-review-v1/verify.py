"""Independent bounded native/tier check and offline inspection evidence.

Tier arithmetic uses maintained public-test oracles, never producer helpers.
Prepare/craft replay is separately labelled producer consistency, not independent
numerical proof. This file writes only inside its own evidence directory.
"""
from pathlib import Path
import datetime, hashlib, importlib.util, io, json, sys
import numpy as np
from PIL import Image, features

ROOT = Path(__file__).resolve().parents[6]
OUT = Path(__file__).resolve().parent
DOC = OUT.parent
ASSET = ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-004/woodflr1_5'
watched = {}
sha = lambda b: hashlib.sha256(b).hexdigest()
def read(p):
    p = Path(p).resolve(); b = p.read_bytes(); h = sha(b)
    assert p not in watched or watched[p] == h, p
    watched[p] = h
    return b
def load(p): return json.loads(read(p))
def binding(p):
    p = Path(p).resolve()
    return {'file': str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p), 'sha256': sha(read(p))}
def module(p, name):
    read(p); spec = importlib.util.spec_from_file_location(name, p)
    obj = importlib.util.module_from_spec(spec); spec.loader.exec_module(obj)
    return obj
diagnostics = []
def save(im, name, inputs, purpose):
    p = OUT/name; assert not p.exists(), p
    im.save(p)
    diagnostics.append({**binding(p), 'dimensions': list(im.size), 'inputs': inputs, 'purpose': purpose})

batch = load(DOC/'candidate-batch.json')
assert sha(read(DOC/'candidate-batch.json')) == 'fb64953ce5c0042f48a95b64bc9a10ef5ce5e19627eccc7bd1b793c74e9a13b6'
assert batch['schemaVersion'] == 3 and batch['defaultTier'] == 'Mid' and len(batch['items']) == 1
item = batch['items'][0]; nid = item['nativeIdentity']['id']
assert nid == '0bada3070362f749c548267124f282329dfc7c693b75a4416e51dc4a9fa59243'
proof_path = DOC.parent/'native-source-proof.json'; proof = load(proof_path)
row = next(x for x in proof['materials'] if x['nativeIdentity'] == nid)
original = ROOT/item['original']; native = Image.open(io.BytesIO(read(original)))
assert native.mode == 'RGB' and native.size == (64,64)
assert sha(native.convert('RGBA').tobytes()) == row['identity']['rgbaSha256']
assert sha(read(original)) == row['originalSha256']
reader = module(ROOT/proof['reader']['file'], 'blackwood_native_reader')
assert sha(read(ROOT/proof['reader']['file'])) == proof['reader']['sha256']
packs = {}; native_uses = []
for use in row['uses']:
    effective = {}
    for path in use['mountOrder']:
        if path not in packs: packs[path] = reader.Pak(path)
        for name in packs[path].members: effective[name] = packs[path]
    mp, pp = effective[use['map']], effective['gfx/palette.lmp']
    assert mp.member_proof(use['map']) == use['mapMember']
    assert pp.member_proof('gfx/palette.lmp') == use['paletteMember']
    bsp, palette = mp.read(use['map']), pp.read('gfx/palette.lmp')
    parsed, mips = reader.parse_native(bsp, use['slot'])
    rgba = b''.join(palette[i*3:i*3+3]+b'\xff' for i in mips[0])
    assert rgba == native.convert('RGBA').tobytes()
    assert sha(bsp) == use['bspSha256']
    assert [sha(x) for x in mips] == row['identity']['mipIndexedSha256']
    assert sha(palette) == row['identity']['paletteSha256']
    assert reader.canonical_id(row['identity']) == nid
    for key in parsed: assert parsed[key] == use[key]
    native_uses.append({'map': use['map'], 'game': use['game'], 'slot': use['slot'], 'directFaces': parsed['directFaces'], 'fourMipsExact': True})
for p in packs.values():
    assert p.proof == next(x for x in proof['packs'] if x['path'] == str(p.path))

master_path, tier_path = ROOT/item['masterPackage'], ROOT/item['tierReceipt']
master, receipt = load(master_path), load(tier_path)
assert sha(read(master_path)) == item['masterPackageSha256']
assert sha(read(tier_path)) == item['tierReceiptSha256']
for entry in list(master['inputs'].values())+list(master['tools'].values()):
    assert sha(read(entry['file'])) == entry['sha256']
journal = load(ASSET/'selection.json'); entry = next(x for x in journal['items'] if x['id'] == nid)
assert entry['generationCount'] == 1 and entry['generationState'] == 'generated-retained'
assert entry['generatedSha256'] == master['inputs']['generated']['sha256']
assert entry['promptSha256'] == master['inputs']['prompt']['sha256']
photo = Image.open(io.BytesIO(read(master['inputs']['generated']['file'])))
assert photo.mode == 'RGB' and photo.size == (1254,1254)
assert sha(read(master['inputs']['generated']['file'])) == 'ba9745b12d154cf41f62a74d6976e2379075253689c23adde8f0df167d458b0e'
rgb_path, scalar_path = master_path.parent/master['color']['file'], master_path.parent/master['height']['file']
rgb = Image.open(io.BytesIO(read(rgb_path))).convert('RGB')
scalar = np.load(io.BytesIO(read(scalar_path)), allow_pickle=False)
assert rgb.size == (512,512) and scalar.shape == (512,512) and scalar.dtype == np.dtype('float32')
assert np.isfinite(scalar).all() and scalar.min() >= 0 and scalar.max() <= 1
assert sha(read(rgb_path)) == master['color']['sha256'] and sha(read(scalar_path)) == master['height']['sha256']
# Historical producer replay is a consistency check; tier oracle below is independent.
sys.path.insert(0, str(ROOT/'tools/texture_sheets'))
from prepare_texture_master import finish, craft, landmarks_from
landmarks = landmarks_from(read(master['inputs']['landmarks']['file']), native)
assert landmarks['axis'] == 'y'
assert landmarks['points'] == [[0,0],[16,13.881977671451356],[32,32],[48,49.811802232854866],[64,64]]
reg = master['registration']
replay, _ = finish(native, photo, factor=8, vertical_landmarks=landmarks['points'], comparison_divisor=2, method='photographic', color_strength=reg['colorStrength'], field_sigma=reg['fieldSigma'])
buf = io.BytesIO(); replay.save(buf, 'PNG'); assert buf.getvalue() == read(rgb_path)
field, _ = craft(np.asarray(replay,dtype=float)/255, master['height']['profile'], quantize_height=False)
buf = io.BytesIO(); np.save(buf,field.astype('float32'),allow_pickle=False); assert buf.getvalue() == read(scalar_path)
public = module(ROOT/'tests/quake_texture_tiers_test.py', 'blackwood_public_tier_oracle')
read(ROOT/'tests/hexen2_texture_tiers_test.py'); read(ROOT/'tests/fixtures/quake_codec_protected_producers.json')
case = public.QuakeTextureTiersCLI()
case.original, case.master, case.height_file = original.resolve(), rgb_path.resolve(), scalar_path.resolve()
case.native, case.rgb, case.scalar = native.size, rgb, scalar
case.test_unchanged_historical_producer_sources()
decoded = case.verify_output(tier_path.parent, receipt)
assert batch['encodingByRole'] == receipt['encodingByRole']
witnesses = load(DOC/'declared-physical-witnesses-v1.json')['pointsAtMaster512']
samples = []
for tier, images in decoded.items():
    dims = receipt['tiers'][tier]['dimensions']; size = dims[0]
    for role in public.ROLES:
        record = receipt['tiers'][tier]['outputs'][role]
        p = tier_path.parent/record['file']; read(p)
        assert (ROOT/item['tiers'][tier]['files'][role]).resolve() == p.resolve()
    diffuse, height = images['diffuse'], np.asarray(images['height'])[:,:,0]/255
    inputs = {role: binding(tier_path.parent/receipt['tiers'][tier]['outputs'][role]['file']) for role in public.ROLES}
    repeat = Image.new('RGB',(size*2,size*2))
    for y in range(2):
        for x in range(2): repeat.paste(diffuse,(size*x,size*y))
    save(diffuse,tier.lower()+'-diffuse.png',inputs,'Actual decoded 1:1 colour')
    save(repeat,tier.lower()+'-repeat.png',inputs,'Actual decoded 2x2 repeat at native tier pixels')
    save(repeat.crop((size-size//4,size-size//4,size+size//4,size+size//4)),tier.lower()+'-corners.png',inputs,'Actual four-corner cross, 1:1')
    wrap = Image.fromarray(np.concatenate((np.asarray(diffuse)[-size//8:,size//2:,:],np.asarray(diffuse)[:size//8,size//2:,:]),axis=0))
    save(wrap,tier.lower()+'-right-y-wrap.png',inputs,'Continuing right face across Y, 1:1')
    save(images['height'],tier.lower()+'-height.png',inputs,'Actual decoded scalar')
    xyz = np.stack([np.asarray(images[r])[:,:,0] for r in public.ROLES[2:]],axis=2)
    save(Image.fromarray(xyz),tier.lower()+'-xyz.png',inputs,'Actual decoded XYZ channels')
    n = xyz.astype(float)/127.5-1; n /= np.maximum(np.linalg.norm(n,axis=2,keepdims=True),1e-12)
    for light, vector in enumerate(((.65,.35,.7),(-.65,-.35,.7))):
        v=np.asarray(vector);v=v/np.linalg.norm(v)
        shade=.2+.8*np.maximum(np.sum(n*v,axis=2),0)
        save(Image.fromarray(np.round(shade*255).astype('uint8')),tier.lower()+f'-opposed-{light}.png',inputs,'Offline Lambert diagnostic, ambient .2/diffuse .8, light '+str(vector)+'; no GPU/POM claim')
    for divisor in (2,4):
        dims=(64//divisor,64//divisor)
        both=Image.new('RGB',(dims[0]*2,dims[1]));both.paste(native.resize(dims,Image.Resampling.BOX),(0,0));both.paste(diffuse.resize(dims,Image.Resampling.BOX),(dims[0],0))
        save(both,tier.lower()+f'-box-{divisor}.png',inputs,'Left native/right decoded, BOTH BOX reduced to '+str(dims))
        save(both.resize((both.width*8,both.height*8),Image.Resampling.NEAREST),tier.lower()+f'-box-{divisor}-display.png',inputs,'Nearest 8x DISPLAY of both-input BOX comparison; not source pixels')
    for witness in witnesses:
        observed = {}
        for label, xy in witness.items():
            if label == 'label': continue
            x,y = [round(c*size/512) for c in xy]
            observed[label]={'xy':[x,y],'centre':float(height[y,x]),'mean3x3':float(height[y-1:y+2,x-1:x+2].mean())}
        joint=observed['jointXY']
        margins={k:v['mean3x3']-joint['mean3x3'] for k,v in observed.items() if k!='jointXY'}
        assert min(margins.values())>0
        samples.append({'tier':tier,'label':witness['label'],'samples':observed,'faceMinusJointMean3x3':margins})
for report_name, count in [('root-source-master-public.json',14),('root-public-tier-proof.json',28)]:
    root_report = load(DOC/report_name); assert len(root_report['watchedInputs']) == count
    for old in root_report['watchedInputs']: assert sha(read(ROOT/old['file'])) == old['sha256']
for p,h in watched.items(): assert sha(p.read_bytes()) == h
report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'PASS independent offline native/source/codec/tier math; ART verdict separate in review.md','nativeIdentity':nid,'candidate':binding(DOC/'candidate-batch.json'),'master':binding(master_path),'tierReceipt':binding(tier_path),'verifier':binding(__file__),'nativeUses':native_uses,'packs':[p.proof for p in packs.values()],'producerConsistency':'Exact retained RGB PNG and float NPY replay through unchanged finish/craft; not an independent master numerical implementation','independentTierProof':'Maintained public-test periodic colour, float BOX, cyclic UV-scaled normals, independent Q92/VP8L encode; ten role bytes exact and eight decoded data maps exact','protectedSevenProducerHashes':'PASS maintained public-test pins','diagnostics':diagnostics,'physicalWitnesses':samples,'bluey':{'operation':'agent_whoami','error':'storage_error','correlationId':'4e8f7b220f30422d9f4f780ef07bd218','mutationOutcome':'unknown','automaticRetry':False,'owner':'Root coordinator retains fallback progress; Bluey service owner repairs storage then root reconciles supported card/context/revision'},'limits':['No new generation, authoring, normal/profile tuning, catalogue, Git, Dev, Hexen, desktop build or browser action.','Offline Lambert diagnostics do not prove GPU/POM, runtime, owner acceptance or release.','Physical witness coordinates are fixed existing source-classified samples; not universal per-pixel plane separation.'],'watchedInputs':[{'file':str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p),'sha256':h} for p,h in watched.items()]}
(OUT/'proof.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'verdict':report['verdict'],'nativeOccurrences':len(native_uses),'maps':10,'diagnostics':len(diagnostics),'watchedInputs':len(watched),'minimumFixedMeanMargin':min(v for s in samples for v in s['faceMinusJointMean3x3'].values())}))
