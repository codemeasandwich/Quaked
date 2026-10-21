"""Selected used native alias proof, reusing the retained PACK/BSP reader only."""
from pathlib import Path
import importlib.util,json,hashlib,datetime
from PIL import Image
root=Path(__file__).resolve().parents[5];pp=root/'docs/quake/textures/batch-003/native-source-proof.json';p=json.loads(pp.read_text());rows=[next(x for x in p['materials']if x['name']==name)for name in ['wgrnd1_8','ground1_8']];reader=root/p['reader']['file'];assert hashlib.sha256(reader.read_bytes()).hexdigest()==p['reader']['sha256'];spec=importlib.util.spec_from_file_location('retained_native_reader',reader);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
packs={};observed=[];selected=[];unused=[];selected_data=[]
def pak(path):
 if path not in packs:packs[path]=m.Pak(path)
 return packs[path]
for row in rows:
 original=root/row['original'];assert m.file_sha(original)==row['originalSha256']
 with Image.open(original)as im:assert im.format=='PNG'and im.mode=='RGB'and im.size==(64,64);rgba=im.convert('RGBA').tobytes()
 used=0
 for u in row['uses']:
  effective={}
  for path in u['mountOrder']:
   pk=pak(path)
   for name in pk.members:effective[name]=pk
  mp=effective[u['map']];pal=effective['gfx/palette.lmp'];assert mp.member_proof(u['map'])==u['mapMember']and pal.member_proof('gfx/palette.lmp')==u['paletteMember'];bsp=mp.read(u['map']);assert m.digest(bsp)==u['bspSha256'];parsed,mips=m.parse_native(bsp,u['slot']);palette=pal.read('gfx/palette.lmp');decoded=b''.join(palette[i*3:i*3+3]+b'\xff'for i in mips[0]);assert decoded==rgba and all(x<224for x in mips[0])
  identity={'name':row['name'],'dimensions':parsed['dimensions'],'paletteSha256':m.digest(palette),'indexedSha256':m.digest(mips[0]),'rgbaSha256':m.digest(decoded),'mipIndexedSha256':[m.digest(x)for x in mips],'materialFlags':parsed['materialFlags'],'nativeSemantics':{'family':'ordinary-world','alphaIndex255':False,'fullbrightStart':224,'fullbrightMaskSha256':m.digest(bytes(255if x>=224 else 0for x in mips[0]))}}
  nativeid=m.canonical_id(identity);assert nativeid==u['nativeIdentity']
  for key in parsed:assert parsed[key]==u[key],(u['map'],key)
  record={'name':row['name'],'game':u['game'],'map':u['map'],'slot':u['slot'],'nativeIdentity':nativeid,'materialFlags':parsed['materialFlags'],'directFaces':parsed['directFaces'],'paletteIndexedRGBAAll4MipsExact':True,'effectivePAKAndTexinfoExact':True}
  if parsed['directFaces']>0:
   assert identity==row['identity']and nativeid==row['nativeIdentity']and parsed['materialFlags']==[0];record['selection']='Selected used ordinaryWORLD content; eligiblefor bounded aliasproof';selected_data.append((palette,mips,identity));used+=1
  else:
   assert parsed['materialFlags']==[]and any(v['id']==nativeid for v in row['otherNativeIdentities']);record['selection']='UNUSED embedded flags[] semanticvariant; explicitly excluded from alias';unused.append(record)
  observed.append(record)
 assert used>0;selected.append({'name':row['name'],'nativeIdentity':row['nativeIdentity'],'original':{'file':row['original'],'sha256':row['originalSha256']},'selectedUsedOccurrences':used})
basepal,basemips,baseid=selected_data[0];base={k:v for k,v in baseid.items()if k!='name'}
for palette,mips,identity in selected_data:assert palette==basepal and all(a==b for a,b in zip(mips,basemips))and {k:v for k,v in identity.items()if k!='name'}==base
assert (root/rows[0]['original']).read_bytes()==(root/rows[1]['original']).read_bytes()
for pk in packs.values():assert pk.proof==next(x for x in p['packs']if x['path']==str(pk.path))
out=Path(__file__).with_name('selected-alias-proof.json');report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'PASS exact selected USED native content alias, name difference retained','workspace':str(root),'canonicalNative':selected[0],'aliasNative':selected[1],'rootProof':{'file':str(pp.relative_to(root)),'sha256':m.file_sha(pp)},'reader':p['reader'],'verifier':{'file':str(Path(__file__).relative_to(root)),'sha256':m.file_sha(__file__)},'comparison':{'dimensionsExact':[64,64],'paletteBytesExact':True,'indexedBytesExact':True,'RGBABytesExact':True,'allFourMipBytesExact':True,'ordinaryMaterialFlagsExact':[0],'nativeSemanticsExact':baseid['nativeSemantics'],'originalPNGBytesExact':True,'identityFieldsEqualExceptName':True,'differentStrongIDsRetained':True},'occurrences':observed,'excludedUnusedSemanticVariants':unused,'counts':{'physicalNativeContents':1,'selectedNativeBindings':2,'usedOccurrences':sum(x['selectedUsedOccurrences']for x in selected),'excludedUnusedOccurrences':len(unused),'reconstructedMips':4*len(observed)},'packProofs':[pk.proof for pk in packs.values()],'permittedReuse':'One futurequalified source/master/tier package may serve both selected USED bindings. Keep each nativeID/name and own unchanged Lowreference. No alias for unused flags[] identity.','limits':['This proof re-invokes retainedreader on currentPACK/BSPbytes; it is not a second independentlyimplemented parser.','No image/source/master/relief/codec/ART/runtime acceptance. Aliascontent does not qualify an unaccepted photographiccandidate.','PerfaceUVvectors/mountprovenance are retained peroccurrence; matchingtexturecontent does not claim identicalUVusage.']};out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'verdict':report['verdict'],'receipt':str(out.relative_to(root)),'sha256':m.file_sha(out),'counts':report['counts']}))
