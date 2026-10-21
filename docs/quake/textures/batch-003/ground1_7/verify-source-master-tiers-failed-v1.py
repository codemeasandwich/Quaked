"""Bounded actual ground1_7 witness driver; reuse maintained public oracles.

Native reads reuse the unchanged PACK/BSP proof reader. Initial master replay
uses the declared unchanged finish/craft producers as a source-consistency
contract, while both tier outputs use the separate maintained test oracle.
No source/master/tier is written, no public suite is weakened or broadly rerun.
"""
from pathlib import Path
import datetime
import hashlib
import importlib.util
import io
import json
import sys

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[5]
HERE=Path(__file__).resolve().parent
EXPECTED='41987356d8ccd3f5a1754b2e514d85e13d6e3dbc2dc454949524b5992db26e00'
OUT=HERE/'independent-actual-public-math.json'
assert not OUT.exists()
sha=lambda data:hashlib.sha256(data).hexdigest()
watched={}
def read(path):
    path=Path(path).resolve();path.relative_to(ROOT)
    data=path.read_bytes()
    assert path not in watched or watched[path]==sha(data),'Input changed during verification'
    watched[path]=sha(data)
    return data
def module(path,name):
    read(path);spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result

report={'schemaVersion':1,'recordType':'Independent actual ground1_7 source/master and both-tier public-math proof',
 'reviewer':'/root/quake_checkpoint_review; independent of source/master/tier author',
 'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'Only ground1_7 selected batch003 native identity, retained initial source/master and actual Mid256/High512 ten maps. No material/physical ART/browser/runtime acceptance.',
 'verdict':'HOLD verification not complete'}
try:
    test=module(ROOT/'tests/quake_texture_tiers_test.py','ground17_maintained_public_oracle')
    read(ROOT/'tests/hexen2_texture_tiers_test.py')
    fixture=json.loads(read(ROOT/'tests/fixtures/quake_codec_protected_producers.json'))
    for row in fixture['protectedSourceBindings']:read(ROOT/row['file'])
    native_path=ROOT/'docs/quake/textures/batch-003/native-source-proof.json'
    native_doc=json.loads(read(native_path))
    natives=[x for x in native_doc['materials']if x['name']=='ground1_7']
    assert len(natives)==1
    native=natives[0];assert native['nativeIdentity']==EXPECTED
    assert len(native['uses'])==2,'Do not invent an extra occurrence'
    native_reader=module(ROOT/native_doc['reader']['file'],'ground17_existing_native_reader')
    assert sha(read(ROOT/native_doc['reader']['file']))==native_doc['reader']['sha256']
    packs={};pack_stats={};occurrences=[]
    def pack(path):
        if path not in packs:
            packs[path]=native_reader.Pak(path)
            prior=next(x for x in native_doc['packs']if x['path']==path)
            assert packs[path].proof==prior
            stat=Path(path).stat();pack_stats[path]=(stat.st_size,stat.st_mtime_ns)
        return packs[path]
    original_path=ROOT/native['original']
    original_bytes=read(original_path)
    original=Image.open(io.BytesIO(original_bytes))
    assert original.format=='PNG' and original.size==(64,64)
    rgba=original.convert('RGBA').tobytes()
    assert sha(original_bytes)==native['originalSha256']
    for use in native['uses']:
        effective={}
        for path in use['mountOrder']:
            for member in pack(path).members:effective[member]=pack(path)
        owner=effective[use['map']];palette_owner=effective['gfx/palette.lmp']
        assert owner.member_proof(use['map'])==use['mapMember']
        assert palette_owner.member_proof('gfx/palette.lmp')==use['paletteMember']
        bsp=owner.read(use['map']);palette=palette_owner.read('gfx/palette.lmp')
        assert sha(bsp)==use['bspSha256'] and len(palette)==768
        parsed,mips=native_reader.parse_native(bsp,use['slot'])
        for key,value in parsed.items():assert value==use[key],key
        observed_rgba=b''.join(palette[x*3:x*3+3]+b'\xff'for x in mips[0])
        assert observed_rgba==rgba
        identity={'name':parsed['name'],'dimensions':parsed['dimensions'],'paletteSha256':sha(palette),
          'indexedSha256':sha(mips[0]),'rgbaSha256':sha(rgba),'mipIndexedSha256':[sha(x)for x in mips],
          'materialFlags':parsed['materialFlags'],'nativeSemantics':{'family':'ordinary-world',
          'alphaIndex255':False,'fullbrightStart':224,'fullbrightMaskSha256':sha(bytes(255 if x>=224 else 0 for x in mips[0]))}}
        assert identity==native['identity'] and native_reader.canonical_id(identity)==EXPECTED
        occurrences.append({'game':use['game'],'map':use['map'],'slot':use['slot'],
          'directFaces':parsed['directFaces'],'allFourMipsPaletteIndexedRGBAFlagsExact':True,
          'bspSha256':sha(bsp),'mapMember':use['mapMember'],'paletteMember':use['paletteMember']})
    batch_path=HERE/'candidate-batch.json';batch=json.loads(read(batch_path))
    assert batch['schemaVersion']==3 and batch['family']=='quake' and len(batch['items'])==1
    item=batch['items'][0]
    assert item['name']=='ground1_7' and item['nativeIdentity']['id']==EXPECTED
    mp=ROOT/item['masterPackage'];tp=ROOT/item['tierReceipt']
    master_bytes,tier_bytes=read(mp),read(tp)
    assert sha(master_bytes)==item['masterPackageSha256'] and sha(tier_bytes)==item['tierReceiptSha256']
    master,receipt=json.loads(master_bytes),json.loads(tier_bytes)
    assert master['schemaVersion']==1 and type(master['generationCount'])is int and master['generationCount']==1
    assert master['name']==item['name'] and master['edition']==item['edition']
    assert master['canonicalMasterFactor']==8 and master['nativeDimensions']==[64,64]
    assert master['masterDimensions']==[512,512] and 'masterRevision'not in master and 'layeredRelief'not in master
    assert set(master['inputs'])=={'original','generated','prompt'}
    sources={}
    for role,row in master['inputs'].items():
        sources[role]=read(row['file']);assert sha(sources[role])==row['sha256']
    assert sources['original']==original_bytes and Path(master['inputs']['original']['file']).resolve()==original_path
    expected_tools={'prepare':ROOT/'tools/texture_sheets/prepare_texture_master.py',
      'finish':ROOT/'tools/texture_sheets/finish_official_texture.py',
      'derive':ROOT/'tools/texture_sheets/derive_texture_tiers.py','craft':ROOT/'tools/craft_normals.py'}
    assert set(master['tools'])==set(expected_tools)
    for role,row in master['tools'].items():
        assert Path(row['file']).resolve()==expected_tools[role]
        assert sha(read(row['file']))==row['sha256']
    generated=Image.open(io.BytesIO(sources['generated']))
    assert generated.format=='PNG' and generated.mode=='RGB' and list(generated.size)==master['generatedDimensions']
    assert generated.width>=512 and generated.height>=512 and generated.width==generated.height
    assert 0<len(sources['prompt'])<=65536 and sources['prompt'].decode('utf8').strip()
    journal_path=mp.parent.parent/'selection.json';journal=json.loads(read(journal_path))
    selected=[x for x in journal['items']if x['id']==EXPECTED];assert len(selected)==1
    selected=selected[0]
    assert selected['generationCount']==1 and selected['generationState']=='generated-retained'
    for role,key in [('original','original'),('generated','generated'),('prompt','prompt')]:
        assert (ROOT/selected[key]).resolve()==Path(master['inputs'][role]['file']).resolve()
        assert selected[key+'Sha256']==master['inputs'][role]['sha256']
    approval_path=ROOT/selected['independentPlanReview']['file']
    approval_bytes=read(approval_path)
    assert sha(approval_bytes)==selected['independentPlanReview']['sha256']
    approval=json.loads(approval_bytes)
    assert approval['prompt']['sha256']==master['inputs']['prompt']['sha256']
    assert read(ROOT/approval['prompt']['file'])==sources['prompt']
    read(ROOT/approval['plan']['file'])
    assert sha(read(ROOT/approval['plan']['file']))==approval['plan']['sha256']
    sys.path.insert(0,str(ROOT/'tools/texture_sheets'))
    prepare=module(expected_tools['prepare'],'ground17_trusted_source_master_replay')
    reg=master['registration']
    assert reg['method']=='photographic' and reg['factor']==8 and reg['comparisonDivisor']==2
    assert reg['edgeAnchor']is False and reg['axis']is None and reg['verticalLandmarks']is None
    assert 'periodicBoundary'not in reg
    rgb,_=prepare.finish(original.convert('RGB'),generated,factor=8,vertical_landmarks=None,
      comparison_divisor=2,method='photographic',color_strength=reg['colorStrength'],field_sigma=reg['fieldSigma'])
    stream=io.BytesIO();rgb.save(stream,'PNG');stored_rgb=read(mp.parent/master['color']['file'])
    assert stream.getvalue()==stored_rgb and sha(stored_rgb)==master['color']['sha256']
    profile={**prepare.profile_for('stone'),'strength':.3,'cap':.5}
    assert master['height']['profile']==profile
    height,_=prepare.craft(np.asarray(rgb,dtype=float)/255,profile,quantize_height=False)
    height=height.astype('float32');stream=io.BytesIO();np.save(stream,height,allow_pickle=False)
    stored_height=read(mp.parent/master['height']['file'])
    assert stream.getvalue()==stored_height and sha(stored_height)==master['height']['sha256']
    case=test.QuakeTextureTiersCLI()
    case.original=Path(receipt['inputs']['original']['file']).resolve()
    case.master=Path(receipt['inputs']['master']['file']).resolve()
    case.height_file=Path(receipt['inputs']['heightMaster']['file']).resolve()
    assert case.original==original_path==(ROOT/item['original']).resolve()
    assert case.master==(mp.parent/master['color']['file']).resolve()
    assert case.height_file==(mp.parent/master['height']['file']).resolve()
    case.native=(64,64);case.rgb=Image.open(io.BytesIO(stored_rgb)).convert('RGB')
    case.scalar=np.load(io.BytesIO(stored_height),allow_pickle=False)
    assert np.array_equal(case.scalar,height) and np.isfinite(case.scalar).all()
    for tier,row in receipt['tiers'].items():
        assert set(item['tiers'][tier]['files'])==set(row['outputs'])
        for role,record in row['outputs'].items():
            path=tp.parent/record['file']
            assert path.resolve()==(ROOT/item['tiers'][tier]['files'][role]).resolve()
            read(path)
    case.test_unchanged_historical_producer_sources()
    case.verify_output(tp.parent,receipt)
    for path,digest in watched.items():assert sha(path.read_bytes())==digest
    for path,prior in pack_stats.items():
        stat=Path(path).stat();assert (stat.st_size,stat.st_mtime_ns)==prior
    report.update(verdict='PASS_BOUNDED_ACTUAL_SOURCE_MASTER_AND_BOTH_TIERS_PUBLIC_MATH',
      native={'id':EXPECTED,'occurrences':occurrences,'occurrenceCount':2,'mipObservations':8,
      'countLimit':'Selected current batch003 ground1_7 row contains two used occurrences, not three. No other maps/aliases inferred.'},
      sourceMaster={'exactPNGBytes':True,'exactFloat32NPYBytes':True,'masterPackage':{'file':str(mp.relative_to(ROOT)),'sha256':sha(master_bytes)},
      'sourceReplayContract':'Unchanged declared finish/craft source helpers; source consistency only, no independent physical/art oracle.',
      'journalGenerationCount':1,'rawDimensions':list(generated.size)},
      tierPublicMath={'maintainedVerifier':'QuakeTextureTiersCLI.verify_output plus its raw_maps independent helper; no assertions removed/rewritten',
      'tiers':{'Mid':[256,256],'High':[512,512]},'exactRoleByteExports':10,'exactLosslessDataMaps':8,'Q92Method6Diffuse':2,
      'includes':'ActualRIFF codecs/intended channels/hash/byte/dimensions, prequantized independentBOX/scalar/UVnormals/directRGB, bothinputBOX32/16, quantization and normal-angle diagnostic equality.',
      'preservationGate':'Exact maintained seven-producer hash fixture check passed; no broader217file custody claim.',
      'broadSuitesRerun':False},
      candidateBatch={'file':str(batch_path.relative_to(ROOT)),'sha256':sha(read(batch_path))})
except Exception as error:
    report.update(verdict='HOLD_ACTUAL_VERIFICATION_FAILED',failure={'type':type(error).__name__,'message':str(error)})
finally:
    read(__file__)
    report['verifier']={'file':str(Path(__file__).relative_to(ROOT)),'sha256':sha(Path(__file__).read_bytes())}
    report['watchedInputs']=[{'file':str(p.relative_to(ROOT)),'sha256':v}for p,v in watched.items()]
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    report['limits']=['Only selected ground1_7 source/master and actual tenmap numerical/source custody scope.',
      'No material, seam, physical semantic, allnativefamily, shader/GPU, game runtime, catalog, owner, CI or release acceptance.',
      'Generation journal/provenance metadata was rebound, not provider transcript authentication.',
      'Only this driver and fresh report written; source/master/maps/currenttools unchanged.']
    OUT.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'verdict':report['verdict'],'report':str(OUT),'watchedInputs':len(watched)}))
if not report['verdict'].startswith('PASS'):sys.exit(1)
