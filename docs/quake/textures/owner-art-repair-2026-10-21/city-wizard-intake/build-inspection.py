from pathlib import Path
import json,hashlib,datetime
import numpy as np
from PIL import Image
O=Path(__file__).resolve().parent;R=O.parents[4]
manifest=R/'tools/texture_sheets/sources/level-2026-10-02/manifest.json';recipe=json.loads(manifest.read_text())
indexp=R/'assets/game/textures/index.json';index=json.loads(indexp.read_text())
q92p=R/'tools/texture_sheets/sources/official-world-2026-10-17/owner-q92-first-tranche-v2.json';q92=json.loads(q92p.read_text())
records=[];checks=[];materials=[]
def rec(p):
 p=Path(p);row={'file':str(p.relative_to(R)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
 if p.suffix in ('.png','.webp'):
  im=Image.open(p);row.update(dimensions=list(im.size),mode=im.mode)
 return row
def save(im,n,op):
 p=O/n;im.save(p);records.append({**rec(p),'operation':op});return p
inputs=[rec(p) for p in (manifest,indexp,q92p,O/'native-provenance.json')]
for name in ('city5_3','wizmet1_3'):
 s=recipe['tiles'][name];sp=R/'assets/authoring/texture_sheets/sources/level-2026-10-02'/s['source'];sheet=Image.open(sp).convert('RGB')
 assert hashlib.sha256(sp.read_bytes()).hexdigest()==recipe['sources'][s['source']]['sha256']
 crop=sheet.crop(s['crop']);save(crop,name+'-source-crop-1to1.png',{'input':str(sp.relative_to(R)),'literalCrop':s['crop']})
 registered=Image.fromarray(np.roll(np.asarray(crop.resize((256,256),Image.Resampling.LANCZOS)),(s['phaseNative'][1]*4,s['phaseNative'][0]*4),(0,1)))
 save(registered,name+'-source-replay256.png',{'input':name+'-source-crop-1to1.png','method':'Existing update_level_sheets: directLANCZOS256 then literalroll(phaseNative*4)','phaseNative':s['phaseNative']})
 native=Image.frombytes('RGBA',(64,64),(O/(name+'-native.rgba')).read_bytes()).convert('RGB');save(native,name+'-native.png',{'input':name+'-native.rgba','method':'PaletteconvertedactualnativeRGBA'})
 predecessor=R/'assets/game/textures'/(name+'.webp');installed=R/'assets/game/textures'/index['textures'][name];height=R/'assets/game/textures'/index['normals'][name]['file'];oldheight=R/'assets/game/textures/normals'/(name+'.webp')
 pre=Image.open(predecessor).convert('RGB');cur=Image.open(installed).convert('RGB')
 checks.append({'check':name+' exact owner crop+phase predecessor replay','pass':np.array_equal(np.asarray(pre),np.asarray(registered))})
 for role,path in (('diffuse',installed),('height',height)):
  row=next(x for x in q92['maps'] if x['donor']==name and x['role']==role)
  checks.append({'check':name+' current Q92 '+role+' equals recorded successor','pass':hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256']})
 for label,im in [('native',native),('predecessor',pre),('installed',cur)]:
  save(im,name+'-'+label+'-1to1.png',{'input':label,'method':'actualdecodedpixels'})
  save(Image.fromarray(np.tile(np.asarray(im),(2,2,1))),name+'-'+label+'-repeat2.png',{'input':label,'method':'literal2x2repeat'})
  save(Image.fromarray(np.roll(np.asarray(im),(im.height//2,im.width//2),(0,1))),name+'-'+label+'-corners.png',{'input':label,'method':'literalhalfsizeXYroll'})
  for size in (32,16):save(im.resize((size,size),Image.Resampling.BOX),name+'-'+label+'-box'+str(size)+'.png',{'input':label,'method':'directsamePillowBOX'+str(size)})
  a=np.asarray(im);band=8 if label=='native' else 32
  save(Image.fromarray(np.concatenate([a[:,-band:],a[:,:band]],1)),name+'-'+label+'-xjoin.png',{'input':label,'method':'literalright+left','band':band})
  save(Image.fromarray(np.concatenate([a[-band:],a[:band]],0)),name+'-'+label+'-yjoin.png',{'input':label,'method':'literalbottom+top','band':band})
 for size in (32,16):
  panel=Image.new('RGB',(768,256))
  for j,im in enumerate((native,pre,cur)):panel.paste(im.resize((size,size),Image.Resampling.BOX).resize((256,256),Image.Resampling.NEAREST),(j*256,0))
  save(panel,name+'-native-predecessor-installed-box'+str(size)+'.png',{'columns':['actualnative','earlypredecessor','currentinstalledQ92'],'method':'bothinputs sameBOX; nearest256displayonly'})
 save(native.resize((512,512),Image.Resampling.NEAREST),name+'-native-nearest512.png',{'input':'native','method':'nearestdisplayonly'})
 inputs.extend(rec(p) for p in (sp,predecessor,installed,height,oldheight))
 materials.append({'name':name,'sourceSpec':s,'sourceCropDimensions':list(crop.size),'nativeDimensions':[64,64],'installedDimensions':list(cur.size),'phaseOutputPixels':[x*4 for x in s['phaseNative']],'sourceSupports4xNoUpscale':min(crop.size)>=256,'sourceSupports8xNoUpscale':min(crop.size)>=512,'bindings':{'predecessor':rec(predecessor),'installed':rec(installed),'height':rec(height),'oldHeight':rec(oldheight)},'maxDecodedSuccessorDifference':int(np.abs(np.asarray(cur).astype(int)-np.asarray(pre).astype(int)).max())})
report={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Read-onlyintake and exactpixelinspection; no repair trial or accepted output','inputs':inputs,'materials':materials,'checks':checks,'allChecksPass':all(x['pass'] for x in checks),'views':records}
(O/'inspection-provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'checks':checks,'materials':materials},indent=2));assert report['allChecksPass']
