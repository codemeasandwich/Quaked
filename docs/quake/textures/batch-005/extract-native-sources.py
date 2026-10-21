"""Bounded native intake reuses existing PACK/BSP proof reader without modifying it."""
from pathlib import Path
import importlib.util,json,hashlib,datetime
from PIL import Image
ROOT=Path(__file__).resolve().parents[4]
helper=ROOT/'docs/quake/textures/batch-001-native-source-proof.py'
spec=importlib.util.spec_from_file_location('native_proof',helper);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
inv_path=ROOT/'docs/evidence/quake-textures-2026-10-20/legacy-baseline/inventory.json';inv=json.loads(inv_path.read_text());assert not inv['errors']
base=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-005';base.mkdir(exist_ok=True)
allowed={base/n/'originals'/('native-'+n+'.png')for n in ['TF_Stone_00','TF_Brick1_01','TF_Wood01_2']}
assert all(p in allowed for p in base.rglob('*')if p.is_file()),'Unexpected existing intakefile'
packs={};rows=[]
def pak(path):
 if path not in packs:packs[path]=m.Pak(path)
 return packs[path]
for name in ['TF_Stone_00','TF_Brick1_01','TF_Wood01_2']:
 variants=[r for r in inv['variants']if r['name']==name];assert len(variants)==1
 legacy=variants[0];identities={};uses=[];native_rgba=None;native_dims=None
 for use in legacy['uses']:
  order=inv['games'][use['game']]['packs'];search={}
  for path in order:
   current=pak(path)
   for member in current.members:search[member]=current
  current=search[use['map']];assert current.real==Path(use['pack']).resolve()
  bsp=current.read(use['map']);parsed,mips=m.parse_native(bsp,use['slot']);assert parsed['name']==name
  palette=search['gfx/palette.lmp'].read('gfx/palette.lmp');assert len(palette)==768
  rgba=b''.join(palette[i*3:i*3+3]+b'\xff'for i in mips[0]);assert m.digest(rgba)==legacy['pixelSha256']
  dims=parsed['dimensions'];assert dims==[legacy['width'],legacy['height']]
  identity={'name':name,'dimensions':dims,'paletteSha256':m.digest(palette),'indexedSha256':m.digest(mips[0]),'rgbaSha256':m.digest(rgba),'mipIndexedSha256':[m.digest(x)for x in mips],'materialFlags':parsed['materialFlags'],'nativeSemantics':{'family':'ordinary-world','alphaIndex255':False,'fullbrightStart':224,'fullbrightMaskSha256':m.digest(bytes(255 if x>=224 else 0 for x in mips[0]))}}
  native_id=m.canonical_id(identity);identities[native_id]=identity
  assert parsed['directFaces']==use['faces']
  uses.append({'game':use['game'],'scope':use['scope'],'map':use['map'],'slot':use['slot'],'nativeIdentity':native_id,'bspSha256':m.digest(bsp),'mapMember':current.member_proof(use['map']),'paletteMember':search['gfx/palette.lmp'].member_proof('gfx/palette.lmp'),'mountOrder':order,**parsed})
  native_rgba=rgba;native_dims=dims
 used_ids={u['nativeIdentity']for u in uses if u['directFaces']>0};assert len(used_ids)==1,'Visible same-name variants require separate authoring selection'
 native_id=next(iter(used_ids));out=base/name/'originals'/('native-'+name+'.png');out.parent.mkdir(parents=True,exist_ok=True)
 if out.exists():assert Image.open(out).convert('RGBA').tobytes()==native_rgba,'Existing native bytes differ'
 else:Image.frombytes('RGBA',tuple(native_dims),native_rgba).convert('RGB').save(out,'PNG')
 assert Image.open(out).convert('RGBA').tobytes()==native_rgba
 rows.append({'name':name,'nativeIdentity':native_id,'identity':identities[native_id],'otherNativeIdentities':[{'id':k,'identity':v,'selection':'Unselected unused embedded semantic variant; do not alias'}for k,v in identities.items()if k!=native_id],'nativeDimensions':native_dims,'original':str(out.relative_to(ROOT)),'originalSha256':m.file_sha(out),'legacyStatus':legacy['status'],'legacyAction':legacy['action'],'uses':uses,'profile':'wood' if 'Wood' in name else 'stone','status':'Native source PASS only; no generation/master/tier/material acceptance'})
report={'verdict':'PASS within selected3native intake only','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Actual unchanged palette/indexed/RGBA/all4mips/texinfoflags andeffectivePAKprovenance for TF_Stone_00,TF_Brick1_01,TF_Wood01_2. Existing weak inventory locates occurrences; actual bytes determine newstrong IDs. Extra map rows retained separately byscope. No generation or artwork qualification.','reader':{'file':str(helper.relative_to(ROOT)),'sha256':m.file_sha(helper)},'driver':{'file':str(Path(__file__).relative_to(ROOT)),'sha256':m.file_sha(__file__)},'inventory':{'file':str(inv_path.relative_to(ROOT)),'sha256':m.file_sha(inv_path)},'packs':[p.proof for p in packs.values()],'materials':rows}
(ROOT/'docs/quake/textures/batch-005/native-source-proof.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'nativeMaterials':len(rows),'occurrences':sum(len(r['uses'])for r in rows),'materials':[{'name':r['name'],'id':r['nativeIdentity'],'dimensions':r['nativeDimensions']}for r in rows]}))
