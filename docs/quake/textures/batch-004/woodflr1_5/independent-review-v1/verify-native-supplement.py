"""Rebuild the complete strong identity from actual effective native bytes.
Read-only native inputs; writes only a fresh named supplement in this directory.
"""
from pathlib import Path
import datetime, hashlib, importlib.util, json
from PIL import Image
ROOT=Path(__file__).resolve().parents[6]
OUT=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
proof_path=OUT.parent.parent/'native-source-proof.json'
proof=json.loads(proof_path.read_text())
row=next(x for x in proof['materials'] if x['name']=='woodflr1_5')
reader_path=ROOT/proof['reader']['file']
assert sha(reader_path.read_bytes())==proof['reader']['sha256']
spec=importlib.util.spec_from_file_location('strong_native_reader',reader_path)
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
packs={};rows=[]
for use in row['uses']:
    effective={}
    for path in use['mountOrder']:
        if path not in packs:packs[path]=reader.Pak(path)
        for name in packs[path].members:effective[name]=packs[path]
    mp,pp=effective[use['map']],effective['gfx/palette.lmp']
    assert mp.member_proof(use['map'])==use['mapMember']
    assert pp.member_proof('gfx/palette.lmp')==use['paletteMember']
    bsp,palette=mp.read(use['map']),pp.read('gfx/palette.lmp')
    parsed,mips=reader.parse_native(bsp,use['slot'])
    rgba=b''.join(palette[i*3:i*3+3]+b'\xff' for i in mips[0])
    actual={'name':'woodflr1_5','dimensions':parsed['dimensions'],'paletteSha256':sha(palette),'indexedSha256':sha(mips[0]),'rgbaSha256':sha(rgba),'mipIndexedSha256':[sha(x) for x in mips],'materialFlags':parsed['materialFlags'],'nativeSemantics':{'family':'ordinary-world','alphaIndex255':False,'fullbrightStart':224,'fullbrightMaskSha256':sha(bytes(255 if x>=224 else 0 for x in mips[0]))}}
    assert actual==row['identity']
    assert reader.canonical_id(actual)==row['nativeIdentity']=='0bada3070362f749c548267124f282329dfc7c693b75a4416e51dc4a9fa59243'
    original=ROOT/row['original'];assert sha(original.read_bytes())==row['originalSha256']
    assert Image.open(original).convert('RGBA').tobytes()==rgba
    assert sha(bsp)==use['bspSha256']
    for key in parsed:assert parsed[key]==use[key]
    rows.append({'game':use['game'],'map':use['map'],'slot':use['slot'],'actualConstructedIdentity':actual,'nativeIdentity':reader.canonical_id(actual)})
for pak in packs.values():assert pak.proof==next(x for x in proof['packs'] if x['path']==str(pak.path))
initial=json.loads((OUT/'proof.json').read_text())
for bound in initial['watchedInputs']:assert sha((ROOT/bound['file']).read_bytes())==bound['sha256']
report={'verdict':'PASS complete strong identities constructed from actual effective native bytes','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceProof':{'file':str(proof_path.relative_to(ROOT)),'sha256':sha(proof_path.read_bytes())},'verifier':{'file':str(Path(__file__).relative_to(ROOT)),'sha256':sha(Path(__file__).read_bytes())},'initialProof':{'file':str((OUT/'proof.json').relative_to(ROOT)),'sha256':sha((OUT/'proof.json').read_bytes())},'unchangedInitialWatchedCount':len(initial['watchedInputs']),'occurrences':rows,'packProofs':[p.proof for p in packs.values()],'limit':'Independent invocation of maintained native reader, not a separately implemented parser; no GPU or ART acceptance.'}
path=OUT/'native-supplement.json';assert not path.exists();path.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'verdict':report['verdict'],'occurrences':len(rows),'sha256':sha(path.read_bytes())}))
