"""Derive both enhanced tiers from each sole master package; never from old4x art."""
from pathlib import Path
import json,hashlib,subprocess,sys
ROOT=Path(__file__).resolve().parents[5]
HERE=Path(__file__).resolve().parent
TOOL=ROOT/'tools/texture_sheets/derive_texture_tiers.py'
NATIVE=ROOT/'docs/evidence/hexen2-textures-2026-10-19/current/inventory.json'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
RECIPES=[('rtex337','base','01-rtex337-3bbe64a968db.png','3bbe64a968db'),('rtex450','portals','13-rtex450-4f3556a977d8.png','4f3556a977d8'),('rtex041','base','07-rtex041-8defb77be8c0.png','8defb77be8c0'),('ttex016','portals','14-ttex016-44b57bef065e.png','44b57bef065e')]
output=HERE/'tiers'
assert not output.exists(), 'Never overwrite a retained tier batch'
rows=json.loads(NATIVE.read_text())['variants']
items=[]
for name,edition,original_name,prefix in RECIPES:
 package=HERE/'masters'/name
 master=json.loads((package/'master.json').read_text())
 native=next(row for row in rows if row['id'].startswith(prefix))
 original=HERE/'originals'/original_name
 assert sha(original)==master['inputs'][str(original.relative_to(ROOT))]
 assert sha(package/'color.png')==master['color']['sha256'] and sha(package/'height.npy')==master['height']['sha256']
 dest=output/name
 subprocess.run([sys.executable,str(TOOL),'--original',str(original),'--master',str(package/'color.png'),'--height-master',str(package/'height.npy'),'--output',str(dest)],check=True)
 receipt=json.loads((dest/'manifest.json').read_text())
 items.append({'name':name,'edition':edition,'nativeIdentity':{key:native[key] for key in ('id','width','height','paletteSha256','rgbaSha256','indexedPixelSha256')},
  'original':str(original.relative_to(HERE)),'masterPackage':str((package/'master.json').relative_to(HERE)),
  'masterPackageSha256':sha(package/'master.json'),'tierReceipt':str((dest/'manifest.json').relative_to(HERE)),
  'tierReceiptSha256':sha(dest/'manifest.json'),'generationCount':1,
  'defaultTier':'Mid','tiers':{tier:{'dimensions':r['dimensions'],'files':{role:str((dest/rec['file']).relative_to(HERE)) for role,rec in r['outputs'].items()}} for tier,r in receipt['tiers'].items()},
  'status':'Both-tier public and visual qualification pending; no runtime binding'})
manifest={'schemaVersion':2,'family':'hexen2','standard':'Quake and Hexen common one-master Low/Mid/High','defaultTier':'Mid','Low':'Unchanged original game pixels','tierFactors':{'Mid':4,'High':8},'quality':92,'method':6,'lossless':False,'nativeInventory':str(NATIVE.relative_to(ROOT)),'nativeInventorySha256':sha(NATIVE),'items':items,'toolSha256':sha(TOOL),'integration':'Authoring-only; no runtime/pack/index binding'}
(output/'batch.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Derived four sole-master materials, eight enhanced tiers,40 Q92/method6 maps')
