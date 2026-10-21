"""Docs-only native/art landmark and actual BSP join record. Does not alter texture pixels."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[5];SCENE=OUT.parents[1]/'screenshot-scene-intake'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths={'native':SCENE/'base-native-tech10_1.png','art':ROOT/'assets/game/textures/tech10_1.webp','height':ROOT/'assets/game/textures/normals/tech10_1.webp','index':ROOT/'assets/game/textures/index.json','sceneProof':SCENE/'scene-proof.json'}
scene=json.loads(paths['sceneProof'].read_bytes());m=next(m for m in scene['maps'] if m['source']=='base');faces={f['index']:f for f in m['nearbyFaces']};joins=[]
for fidx in [2823,2828]:
 f=faces[fidx]
 for neighbor in f['sharedEdgeNeighbors']:
  if neighbor['face'] not in faces:continue
  g=faces[neighbor['face']]
  for edge in neighbor['sharedEdges']:
   xyz=[f['vertices'][f['vertexIds'].index(v)] for v in edge]
   uv=lambda face:[[sum(vec[k]*v[k] for k in range(3))+vec[3] for vec in face['vectors']]for v in xyz]
   joins.append({'face':fidx,'neighborFace':g['index'],'neighborTexture':g['texture'],'worldEndpoints':xyz,'tech10_1UV':uv(f),'neighborUV':uv(g),'neighborVectors':g['vectors']})
# Human landmark readings from visible circular silhouettes, in native pixel-edge coordinates.
# Bitmap shading makes sub-texel physical centres ambiguous; +/-1 native texel is the explicit tolerance.
landmarks={'method':'Visual count and approximate silhouette centres, checked against literal pixels and native-coordinate grid; not automatic best-match registration. Centre tolerance +/-1 native texel. Count and actual-face cut phases are exact.','native':{'columnsX':[6.5,57.5],'rowsY':[9.5,20.5,31.5,42.5,53.5],'headsPerColumn':5,'totalHeads':10,'interiorPitchY':11,'lastToFirstAcrossRepeatY':20},'ownerArtwork':{'columnsX':[5.75,58],'rowsY':[5.5,16,26.25,36.25,46.25,56.25],'headsPerColumn':6,'additionalInteriorHeads':[[22.75,5.5],[40.5,5.5],[22.75,56.25],[40.5,56.25]],'totalHeads':16,'interiorPitchesY':[10.5,10.25,10,10,10],'lastToFirstAcrossRepeatY':13.25},'conclusion':'Two side columns both images, but5 versus6 per side column; artwork additionally has4 interior top/bottom row heads (10native versus16artwork total). A periodic monotonic global transform or uniform phase cannot change count; global scale matching11px native pitch would spill an extra art head into an intentional period joint. No shift is approved.'}
report={'scope':'Physical landmark audit of static tech10_1 native64 and exact retained256 owner artwork; no candidate pixels, install or runtime acceptance','inputs':{k:{'file':str(v.relative_to(ROOT)),'sha256':sha(v)}for k,v in paths.items()},'nativeMap':{'pack':m['pack'],'bspSha256':m['bspSha256'],'paletteSha256':m['paletteSha256']},'landmarks':landmarks,'actualFaces':[faces[i]for i in [2823,2828]],'actualSharedEdgeJoins':joins,'decision':'HOLD_GEOMETRY_NO_GLOBAL_SHIFT_OR_SCALE; retain independently passed colour-only trial as an uninstalled trial.','registration':'Exact existing colour256 and height256 remain unchanged and registered as before. A spatial move of RGB alone would misregister old relief; moving both cannot solve motif-count mismatch. No retained full-precision source height authorizes a current-standard relief claim.'}
(OUT/'measurement.json').write_text(json.dumps(report,indent=2)+'\n')
# Evidence magnification only, no repaired art: native | exact owner art at common display scale.
panel=Image.new('RGB',(1024,542),(20,20,20));draw=ImageDraw.Draw(panel)
for j,key in enumerate(['native','art']):
 im=Image.open(paths[key]).convert('RGB').resize((512,512),Image.Resampling.NEAREST);panel.paste(im,(j*512,30));draw.text((j*512,0),'Native5 heads/column'if not j else'Owner6 heads/column; same64 native period',fill='white')
 lm=landmarks['native' if not j else 'ownerArtwork']
 for x in lm['columnsX']:
  for number,y in enumerate(lm['rowsY'],1):
   xx=j*512+x*8;yy=30+y*8;draw.ellipse((xx-6,yy-6,xx+6,yy+6),outline=(0,255,255));draw.text((xx+9,yy),str(number),fill=(0,255,255))
 if j:
  for x,y in lm['additionalInteriorHeads']:
   xx=j*512+x*8;yy=30+y*8;draw.ellipse((xx-7,yy-7,xx+7,yy+7),outline=(255,255,0));draw.text((xx+8,yy),'extra',fill=(255,255,0))
 for y in [4,32,36]:
  yy=30+y*8;draw.line((j*512,yy,j*512+511,yy),fill=(255,70,220),width=1);draw.text((j*512+180,yy+1),'actual cutT='+str(y),fill=(255,70,220))
panel.save(OUT/'native-owner-landmarks-actual-cuts.png')
print(json.dumps({'files':len(paths),'joins':len(joins),'decision':report['decision']}))
