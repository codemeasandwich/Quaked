"""Offline native BSP-plane diagnostic; no runtime or replacement editing."""
from pathlib import Path
import json,math
from PIL import Image,ImageDraw
import numpy as np
P=Path(__file__).resolve().parent;r=json.loads((P/'scene-proof.json').read_text());proof=[]
for maprow in r['maps']:
 for wall,box in [(2112,(-128,-208,288,0)),(2816,(-608,-160,-304,176))]:
  x0,z0,x1,z1=box;w=x1-x0;h=z1-z0;output=np.full((h,w,3),35,dtype=np.uint8);faceids=np.full((h,w),-1,dtype=np.int32)
  # face texture vectors apply at pixel centres in world units.
  xs,zs=np.meshgrid(np.arange(x0,x1)+.5,np.arange(z1,z0,-1)-.5)
  for f in maprow['nearbyFaces']:
   if f['bbox'][0][1]!=wall or f['bbox'][1][1]!=wall:continue
   source=P/(maprow['source']+'-native-'+f['texture']+'.png')
   if not source.exists():continue
   tile=np.asarray(Image.open(source).convert('RGB'));mask=Image.new('L',(w,h));ImageDraw.Draw(mask).polygon([(v[0]-x0,z1-v[2])for v in f['vertices']],fill=255);mask=np.asarray(mask)>0
   s,t=f['vectors'];us=np.floor(s[0]*xs+s[1]*wall+s[2]*zs+s[3]).astype(int)%tile.shape[1];vs=np.floor(t[0]*xs+t[1]*wall+t[2]*zs+t[3]).astype(int)%tile.shape[0]
   output[mask]=tile[vs[mask],us[mask]];faceids[mask]=f['index']
  name=f"{maprow['source']}-native-wall-y{wall}.png";Image.fromarray(output).resize((w*2,h*2),Image.Resampling.NEAREST).save(P/name)
  proof.append({'source':maprow['source'],'wallY':wall,'worldXZBounds':box,'image':name,'nearestEnlargement':2,'uniqueFaces':sorted(int(i)for i in np.unique(faceids)if i>=0)})
# Keep every true shared-edge neighbor relationship for relevant families, with both endpoint UVs.
relationships=[]
for maprow in r['maps']:
 index={f['index']:f for f in maprow['nearbyFaces']}
 for f in index.values():
  if f['texture']not in ['tech09_3','tech11_2']:continue
  if f['bbox'][0][1]!=f['bbox'][1][1]or f['bbox'][0][1]not in [2112,2816]:continue
  for n in f['sharedEdgeNeighbors']:
   if n['face']not in index or n['texture']not in ['tech08_1','tech08_3','tech10_1','tech10_3','tech08_4','tech04_3','tech01_6']:continue
   g=index[n['face']]
   for edge in n['sharedEdges']:
    coords=[f['vertices'][f['vertexIds'].index(v)]for v in edge]
    def uv(face):return [[sum(vec[j]*v[j]for j in range(3))+vec[3]for vec in face['vectors']]for v in coords]
    relationships.append({'source':maprow['source'],'wallY':f['bbox'][0][1],'aFace':f['index'],'aTexture':f['texture'],'bFace':g['index'],'bTexture':g['texture'],'worldEndpoints':coords,'aUV':uv(f),'bUV':uv(g)})
(P/'wall-joins.json').write_text(json.dumps({'nativePlaneDiagnostics':proof,'exactSharedEdgeJoins':relationships,'limits':'Native-only planar reconstruction, using actual per-face UV, not lighting, occlusion, perspective or runtime proof. Endpoint UVs are unwrapped native texels; take modulo actual dimensions for sampling.'},indent=2)+'\n')
