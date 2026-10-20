"""Independent decoded-map inspection support only; no production assets changed."""
from pathlib import Path
import json,hashlib,datetime
import numpy as np
from PIL import Image,ImageDraw
D=Path(__file__).resolve().parent
R=next(p for p in D.parents if (p/'tools/texture_sheets/derive_texture_tiers.py').is_file())
B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-06-mtex470'
O=D/'art-evidence';assert not O.exists();O.mkdir()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rec=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p),'bytes':p.stat().st_size}
b=json.loads((B/'batch.json').read_text());it,=b['items'];mp=R/it['masterPackage'];m=json.loads(mp.read_text())
inputs=[B/'batch.json',mp,mp.parent/'color.png',mp.parent/'height.npy',R/it['original'],D/'actual-v1.json',D/'preview-v1.json']
inputs +=[R/p for t in it['tiers'].values() for p in t['files'].values()];before={p:sha(p)for p in inputs}
# Independently classify actual material points from the observed source RGB.
points=[('F1','left ochre sandstone face','face',55,230),('F2','upper grey sandstone face','face',270,70),('F3','right ochre sandstone face','face',440,260),('F4','lower ochre sandstone face','face',205,420),('F5','central rusty red sandstone face','face',250,250),('J1','upper central dark mortar','joint',265,146),('J2','left central dark mortar','joint',137,245),('J3','right central dark mortar','joint',359,265),('J4','lower central dark mortar','joint',260,361)]
regions={'leftOchreFace':[24,28,110,330],'upperGreyFace':[165,25,480,120],'rightOchreFace':[390,175,480,480],'lowerOchreFace':[25,395,330,480],'centralRedFace':[175,175,330,330]}
semantics={};sourceclass={'classification':'Source RGB viewed before measuring height: five sandstone face interiors and four connected mortar gaps. Exact geology is a chosen plausible interpretation, not a historical identification.','points':[dict(label=l,physicalClass=c,group=g,masterPixel=[x,y])for l,c,g,x,y in points],'faceRegionRectangles':regions}
(D/'source-witness-classification.json').write_text(json.dumps(sourceclass,indent=2)+'\n')
original=Image.open(R/it['original']).convert('RGB');dist=Image.new('RGB',(760,330),(24,26,28));draw=ImageDraw.Draw(dist);draw.text((10,8),'Both native and decoded replacement reduced with BOX. Nearest enlargement for display only.',fill='white')
compositions=[]
for ti,tier in enumerate(('Mid','High')):
 maps={r:Image.open(R/p).convert('RGB')for r,p in it['tiers'][tier]['files'].items()};side=maps['diffuse'].width;factor=side/512
 v=np.stack([np.asarray(maps['normal'+c],float)[:,:,0] for c in 'XYZ'],2)/127.5-1;v/=np.maximum(np.linalg.norm(v,axis=2,keepdims=True),1e-12)
 xyz=Image.fromarray(np.uint8(np.clip((v*.5+.5)*255,0,255)));lights=[];plain=[]
 for sign in (1,-1):
  light=np.array([sign*.6,sign*.3,.75]);light/=np.linalg.norm(light);illum=.35+.65*np.maximum(np.sum(v*light,axis=2),0)
  lights.append(Image.fromarray(np.uint8(np.clip(np.asarray(maps['diffuse'],float)*illum[:,:,None],0,255))))
  plain.append(Image.fromarray(np.uint8(np.clip(illum*255,0,255))).convert('RGB'))
 def board(name,entries):
  width=max(i.width for _,i in entries);height=max(i.height for _,i in entries);sheet=Image.new('RGB',((width+12)*len(entries)+12,height+42),(24,26,28));dr=ImageDraw.Draw(sheet)
  for j,(label,im)in enumerate(entries):dr.text((12+j*(width+12),8),tier+' '+label+' (1:1)',fill='white');sheet.paste(im,(12+j*(width+12),30))
  path=O/(tier.lower()+'-'+name+'.png');sheet.save(path);compositions.append({'output':rec(path),'scale':'1 source pixel = 1 image pixel; no resize','panels':[l for l,_ in entries]})
 board('diffuse-height',[('diffuse',maps['diffuse']),('height',maps['height'])])
 board('normal-lights',[('decoded XYZ',xyz),('light A',lights[0]),('light B',lights[1])])
 board('untextured-lights',[('untextured A',plain[0]),('untextured B',plain[1])])
 repeat=Image.fromarray(np.tile(np.asarray(maps['diffuse']),(2,2,1)));repeat.save(O/(tier.lower()+'-two-by-two.png'))
 # Every X/Y seam and corner is shown as a literal wrapped 128px crop, all five channels.
 sheet=Image.new('RGB',(740,510),(24,26,28));dr=ImageDraw.Draw(sheet);entries=[('diffuse',maps['diffuse']),('height',maps['height']),('XYZ',xyz),('light A',lights[0]),('light B',lights[1])]
 for ai,axis in enumerate(('X','Y','XY')):
  for pi,(label,im)in enumerate(entries):
   a=np.asarray(im);a=np.roll(a,(side//2 if 'Y'in axis else 0,side//2 if 'X'in axis else 0),(0,1));crop=Image.fromarray(a[side//2-64:side//2+64,side//2-64:side//2+64]);x=pi*148+6;y=ai*170+32;dr.text((x,y-23),axis+' '+label,fill='white');sheet.paste(crop,(x,y))
 sheet.save(O/(tier.lower()+'-wraps-corner.png'))
 ann=maps['diffuse'].copy();ad=ImageDraw.Draw(ann);H=np.asarray(maps['height'],float)[:,:,0]/255;rows=[]
 for label,classification,group,sx,sy in points:
  x,y=int((sx+.5)*factor),int((sy+.5)*factor);rad=max(1,round(3*factor));values=H[y-rad:y+rad+1,x-rad:x+rad+1]
  rows.append(dict(label=label,physicalClass=classification,group=group,masterPixel=[sx,sy],tierPixel=[x,y],radius=rad,mean=float(values.mean()),minimum=float(values.min()),maximum=float(values.max())))
  ad.rectangle((x-rad,y-rad,x+rad,y+rad),outline='yellow'if group=='face'else'cyan',width=1);ad.text((x+rad+2,y),label,fill='yellow'if group=='face'else'cyan')
 ann.save(O/(tier.lower()+'-physical-witnesses.png'))
 face_means=[a['mean']for a in rows if a['group']=='face'];joint_means=[a['mean']for a in rows if a['group']=='joint'];areas={}
 for name,(x0,y0,x1,y1)in regions.items():
  x0,y0,x1,y1=[int(v*factor)for v in (x0,y0,x1,y1)];area=H[y0:y1,x0:x1];areas[name]=dict(rectangle=[x0,y0,x1,y1],median=float(np.median(area)),mean=float(area.mean()),p05=float(np.percentile(area,5)),p95=float(np.percentile(area,95)))
 semantics[tier]=dict(samples=rows,allMortarMeansBelowAllFaceMeans=max(joint_means)<min(face_means),separation=min(face_means)-max(joint_means),faceRegions=areas,faceMedianSpread=max(a['median']for a in areas.values())-min(a['median']for a in areas.values()),limit='Broadly coplanar facing planes with source-driven microrelief. Residual regional differences are measured, not claimed exactly pigment-neutral.')
 for j,div in enumerate((2,4)):
  size=(64//div,64//div);a=original.resize(size,Image.Resampling.BOX);c=maps['diffuse'].resize(size,Image.Resampling.BOX);zoom=3;y=38+ti*144;x=j*375+10;draw.text((x,y),tier+' native/'+str(div)+' vs '+tier+' down to '+str(size),fill='white');dist.paste(a.resize((size[0]*zoom,size[1]*zoom),Image.Resampling.NEAREST),(x,y+22));dist.paste(c.resize((size[0]*zoom,size[1]*zoom),Image.Resampling.NEAREST),(x+size[0]*zoom+10,y+22))
dist.save(O/'distance-both-tiers.png')
assert before=={p:sha(p)for p in inputs}
manifest={'scope':'Independent actual decoded material/distance/wrap/corner/height/XYZ/opposed-light inspection; not a production authoring pipeline.','timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputs':[rec(p)for p in inputs],'inputsStable':True,'sourceClassification':rec(D/'source-witness-classification.json'),'semanticWitnesses':semantics,'compositions':compositions,'normalLightFormula':'Decode XYZ channels /127.5-1, normalize; unit +/-[.6,.3,.75] (z remains +.75), .35+.65*max(dot,0). Both textured and untextured diagnostics.','distanceDisplay':'Both original64 and decoded Mid256/High512 BOX to32 and16; nearest display enlargement only.','literalRepeatedMaps':True,'outputs':[rec(p)for p in sorted(O.iterdir())]}
(D/'art-evidence-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'manifest':rec(D/'art-evidence-manifest.json'),'ordering':{k:v['allMortarMeansBelowAllFaceMeans']for k,v in semantics.items()},'faceMedianSpread':{k:v['faceMedianSpread']for k,v in semantics.items()}}))
