"""Read actual retained files and Git blobs; emit docs-only lineage evidence."""
from pathlib import Path
from PIL import Image,ImageDraw
import hashlib,json,subprocess,io,numpy as np
ROOT=Path(__file__).resolve().parents[5]
OUT=Path(__file__).resolve().parent
NAMES=['tech04_3','tech07_2','tech08_1','tech09_3','tech10_1','tech10_3','tech11_2','twall1_2','twall3_1']
COMMITS=['1d6f47c1','72593780','f4a260ec','0abd6528','c865b754','73307bb3']
sha=lambda b:hashlib.sha256(b).hexdigest()
def blob(data):
 im=Image.open(io.BytesIO(data));rgb=im.convert('RGB')
 return {'webpFirstChunk':data[12:16].decode('ascii') if data[:4]==b'RIFF' else None,'sha256':sha(data),'bytes':len(data),'dimensions':list(im.size),'mode':im.mode,'decodedRgbSha256':sha(rgb.tobytes())}
def file(p):
 return {'file':str(p.relative_to(ROOT)),**blob(p.read_bytes())}
def git(*a):return subprocess.check_output(['git',*a],cwd=ROOT,stderr=subprocess.PIPE)
indexfile=ROOT/'assets/game/textures/index.json';idx=json.loads(indexfile.read_bytes())
mfile=OUT/'native-sheets/manifest.json';manifest=json.loads(mfile.read_bytes())
receipt=json.loads((ROOT/'tools/texture_sheets/sources/official-world-2026-10-17/legacy-tech-twelve-q92-v1.json').read_bytes())
report={'scope':'Read-only source/runtime lineage; no repaired artwork or runtime acceptance','worktree':str(ROOT),'head':git('rev-parse','HEAD').decode().strip(),'indexSha256':sha(indexfile.read_bytes()),'nativeManifest':str(mfile.relative_to(ROOT)),'nativeManifestSha256':sha(mfile.read_bytes()),'sourceAtlasStatus':'Original owner-upscaled tech_computers_1 atlas and original wall-sheets manifest were not found in either current checkout. Reproduced native atlas is a new deterministic evidence artifact, not recovered owner artwork.','materials':[]}
canvas=Image.new('RGB',(580,200*len(NAMES)),(22,22,22));draw=ImageDraw.Draw(canvas)
for i,n in enumerate(NAMES):
 t=manifest['textures'][n];sheet=Image.open(mfile.parent/t['sheet']).convert('RGB');native=sheet.crop((t['x'],t['y'],t['x']+t['w'],t['y']+t['h']))
 row={'name':n,'nativeAtlasCrop':t,'nativeDimensions':list(native.size),'nativeRgbSha256':sha(native.tobytes()),'sourceGuards':idx['sources'][n],'currentDiffuse':file(ROOT/'assets/game/textures'/idx['textures'][n]),'currentHeightDescriptor':idx['normals'][n],'currentHeight':file(ROOT/'assets/game/textures'/idx['normals'][n]['file']),'historicalBlobs':[]}
 expected=ROOT/'assets/authoring/texture_sheets/sources/official-world-2026-10-17'/('native-'+n+'.png')
 if expected.exists():row['retainedNativeFile']=file(expected);row['retainedNativePixelsMatchRebuiltAtlas']=Image.open(expected).convert('RGB').tobytes()==native.tobytes();assert row['retainedNativePixelsMatchRebuiltAtlas']
 for c in COMMITS:
  try:b=git('show',c+':newer/textures/'+n+'.webp')
  except subprocess.CalledProcessError:continue
  row['historicalBlobs'].append({'commit':git('rev-parse',c).decode().strip(),'path':'newer/textures/'+n+'.webp',**blob(b)})
 if n=='tech10_1':
  old=git('show','bdae4c5c:newer/textures/metalt2_3.webp');row['originalMislabeledImport']={'commit':git('rev-parse','bdae4c5c').decode().strip(),'path':'newer/textures/metalt2_3.webp',**blob(old)};row['originalImportEqualsCurrent']=sha(old)==row['currentDiffuse']['sha256'];assert row['originalImportEqualsCurrent']
 pre=ROOT/'assets/authoring/texture_sheets/sources/official-world-2026-10-12/legacy-tech-pre-4x/diffuse'/(n+'.webp')
 if pre.exists():
  row['retainedPre4x']=file(pre);row['retainedPre4xEqualsC865Blob']=row['retainedPre4x']['sha256']==[r for r in row['historicalBlobs'] if r['commit'].startswith('c865')][0]['sha256'];row['retainedSourceScale']=[Image.open(pre).width/native.width,Image.open(pre).height/native.height];row['adequate8x']=all(x>=8 for x in row['retainedSourceScale'])
 rr=[r for r in receipt['maps'] if r['name']==n]
 if rr:
  row['q92LineageReceipt']={k:receipt[k] for k in ['factor','quality','lossless','method','qualification']};row['q92ReceiptMaps']=rr
  for r in rr:
   p=ROOT/'assets/authoring/texture_sheets/sources/official-world-2026-10-17/legacy-tech-q92-masters'/Path(r['master']).name
   assert sha(p.read_bytes())==r['masterSha256']
  row['actualQ92MasterFilesMatchHistoricalReceipt']=True
  for r in rr:
   actual=row['currentDiffuse'] if r['role']=='diffuse' else row['currentHeight']
   assert actual['sha256']==r['sha256'], 'Current selected runtime differs from recorded Q92: '+n
  row['actualSelectedRuntimeMatchesQ92Receipt']=True
 im=Image.open(ROOT/'assets/game/textures'/idx['textures'][n]).convert('RGB');row['BOX']={}
 for j,q in enumerate([2,4]):
  sz=(native.width//q,native.height//q);a=native.resize(sz,Image.Resampling.BOX);b=im.resize(sz,Image.Resampling.BOX);aa=np.asarray(a,float);bb=np.asarray(b,float)
  row['BOX'][str(q)]={'dimensions':list(sz),'nativeMeanRgb':aa.mean((0,1)).tolist(),'currentMeanRgb':bb.mean((0,1)).tolist(),'currentMinusNativeMeanRgb':(bb-aa).mean((0,1)).tolist(),'meanAbsoluteRgbDifference':float(np.abs(bb-aa).mean())}
  x=290*j;y=200*i;draw.text((x,y),n+' native/current BOX /'+str(q),fill='white')
  for k,thumb in enumerate([a,b]):
   thumb=thumb.resize((max(1,sz[0]*2),sz[1]*2),Image.Resampling.NEAREST);canvas.paste(thumb,(x+k*136,y+22))
 report['materials'].append(row)
canvas.save(OUT/'half-quarter-BOX.png')
(OUT/'lineage.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'materials':len(report['materials']),'head':report['head'],'retained8xAdequate':[r['name'] for r in report['materials'] if r.get('adequate8x')],'output':str(OUT/'lineage.json')}))
