"""Read-only selected ground1_4 reconstruction using the retained PACK/BSP reader."""
from pathlib import Path
import importlib.util,json,hashlib,datetime
from PIL import Image
root=Path(__file__).resolve().parents[5];proof_path=root/'docs/quake/textures/batch-002/native-source-proof.json';proof=json.loads(proof_path.read_text());row=next(x for x in proof['materials']if x['name']=='ground1_4')
reader=root/proof['reader']['file'];assert hashlib.sha256(reader.read_bytes()).hexdigest()==proof['reader']['sha256'];spec=importlib.util.spec_from_file_location('retained_native_reader',reader);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original=root/row['original'];assert m.file_sha(original)==row['originalSha256']
with Image.open(original)as im:assert im.format=='PNG'and im.size==(64,64)and im.mode=='RGB';rgba=im.convert('RGBA').tobytes()
packs={};observed=[]
def pak(p):
 if p not in packs:packs[p]=m.Pak(p)
 return packs[p]
for use in row['uses']:
 effective={}
 for path in use['mountOrder']:
  p=pak(path)
  for name in p.members:effective[name]=p
 mp=effective[use['map']];pp=effective['gfx/palette.lmp'];assert mp.member_proof(use['map'])==use['mapMember']and pp.member_proof('gfx/palette.lmp')==use['paletteMember'];bsp=mp.read(use['map']);assert m.digest(bsp)==use['bspSha256'];parsed,mips=m.parse_native(bsp,use['slot']);palette=pp.read('gfx/palette.lmp');decoded=b''.join(palette[i*3:i*3+3]+b'\xff'for i in mips[0]);assert decoded==rgba
 identity={'name':'ground1_4','dimensions':parsed['dimensions'],'paletteSha256':m.digest(palette),'indexedSha256':m.digest(mips[0]),'rgbaSha256':m.digest(decoded),'mipIndexedSha256':[m.digest(x)for x in mips],'materialFlags':parsed['materialFlags'],'nativeSemantics':{'family':'ordinary-world','alphaIndex255':False,'fullbrightStart':224,'fullbrightMaskSha256':m.digest(bytes(255if x>=224 else 0for x in mips[0]))}}
 assert identity==row['identity']and m.canonical_id(identity)==row['nativeIdentity']=='35455dabf6f0dbc29303debf312d80695087f2f4914c6df28994ef8e0158ee5a'
 for key in parsed:assert parsed[key]==use[key],(use['map'],key)
 observed.append({'game':use['game'],'map':use['map'],'slot':use['slot'],'directFaces':parsed['directFaces'],'bspSha256':m.digest(bsp),'allFourMipsExact':True,'RGBAEqualsRetainedOriginal':True,'paletteExact':True,'texinfoFlagsAndFaceUseExact':True,'effectiveMembersExact':True})
for p in packs.values():
 expected=next(x for x in proof['packs']if x['path']==str(p.path));assert p.proof==expected
out=Path(__file__).with_name('selected-native-verification.json');report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'PASS selected ground1_4 actual native reconstruction only','workspace':str(root),'nativeIdentity':row['nativeIdentity'],'identity':row['identity'],'original':{'file':row['original'],'sha256':row['originalSha256']},'rootProof':{'file':str(proof_path.relative_to(root)),'sha256':m.file_sha(proof_path)},'reader':proof['reader'],'verifier':{'file':str(Path(__file__).relative_to(root)),'sha256':m.file_sha(__file__)},'occurrences':observed,'packProofs':[p.proof for p in packs.values()],'counts':{'selectedNativeIdentities':1,'RogueMapOccurrences':len(observed),'nativeMipsReconstructed':4*len(observed)},'limits':['Reuse of the retained reader is an actual independent selected-input invocation, not a separately implemented PACK/BSP parser.','No source photo, master, art, seamlessness, semantic relief, tier codec, webGPU or whole-campaign acceptance.']};out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'verdict':report['verdict'],'receipt':str(out.relative_to(root)),'sha256':m.file_sha(out),'counts':report['counts']}))
