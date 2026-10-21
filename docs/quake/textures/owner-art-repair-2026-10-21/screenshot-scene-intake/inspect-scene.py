"""Bounded screenshot-scene intake. Existing Pak/parse_native reader is reused unchanged."""
from pathlib import Path
import struct,importlib.util,json,math,datetime
import numpy as np
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5];OUT=Path(__file__).resolve().parent
reader=ROOT/'docs/quake/textures/batch-001-native-source-proof.py'
spec=importlib.util.spec_from_file_location('native',reader);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def geometry(b):
 assert struct.unpack_from('<i',b)[0]==29
 def lump(i):
  a,n=struct.unpack_from('<ii',b,4+8*i);assert a>=0 and n>=0 and a+n<=len(b);return b[a:a+n]
 vertices=np.frombuffer(lump(3),dtype='<f4').reshape(-1,3)
 edges=np.frombuffer(lump(12),dtype='<u2').reshape(-1,2)
 surf=np.frombuffer(lump(13),dtype='<i4')
 ti=lump(6);tex=lump(2);names=[]
 for i in range(struct.unpack_from('<i',tex)[0]):
  off=struct.unpack_from('<i',tex,4+4*i)[0];names.append(tex[off:off+16].split(b'\0')[0].decode() if off>=0 else None)
 faces=[]
 for i,row in enumerate(struct.iter_unpack('<HhiHH4Bi',lump(7))):
  plane,side,first,count,info,*_=row
  ids=[int(edges[abs(e)][0 if e>=0 else 1])for e in surf[first:first+count]]
  vs=vertices[ids];vec=np.array(struct.unpack_from('<8f',ti,40*info)).reshape(2,4)
  uv=vs@vec[:,:3].T+vec[:,3];slot,flags=struct.unpack_from('<ii',ti,40*info+32)
  faces.append(dict(index=i,texture=names[slot],slot=slot,texinfo=info,flags=flags,vertices=vs.tolist(),vertexIds=ids,uv=uv.tolist(),vectors=vec.tolist(),bbox=[vs.min(0).tolist(),vs.max(0).tolist()]))
 return faces,names

def hit(faces,origin,yaw,pitch,eye=22):
 o=np.array(origin,dtype=float)+[0,0,eye];ya,pi=map(math.radians,[yaw,pitch]);d=np.array([math.cos(pi)*math.cos(ya),math.cos(pi)*math.sin(ya),-math.sin(pi)])
 hits=[]
 for f in faces:
  v=np.array(f['vertices']);n=sum((np.cross(v[j]-v[0],v[(j+1)%len(v)]-v[0])for j in range(len(v))),np.zeros(3));den=np.dot(n,d)
  if abs(den)<1e-7:continue
  t=np.dot(n,v[0]-o)/den
  if t<0:continue
  p=o+t*d;signs=np.array([np.dot(np.cross(v[(j+1)%len(v)]-v[j],p-v[j]),n)for j in range(len(v))])
  if signs.min() < -1e-4 and signs.max()>1e-4:continue
  vec=np.array(f['vectors']);uv=vec[:,:3]@p+vec[:,3];hits.append(dict(face=f['index'],texture=f['texture'],distance=float(t),xyz=p.tolist(),uv=uv.tolist()))
 return sorted(hits,key=lambda h:h['distance'])[:4]

paths=[ROOT/'games/shareware/pak0.pak',Path('/Users/bri/quaked/Quake/pak0.pak')]
report={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'workspace':str(ROOT),'head':'713b47d322f0674f154a70ec4baebd4566905d41','reader':{'path':str(reader.relative_to(ROOT)),'sha256':m.file_sha(reader)},'driverSha256':m.file_sha(__file__),'screenshots':[],'maps':[],'limits':['Screenshot camera origin is transcribed from visible overlay; ray probes use +22 normal standing eye height, with +0 sensitivity retained. Screenshot map identity inferred from coordinate, native geometry and visible native art, not a runtime map command. No runtime, map publication, alias or full-campaign acceptance.','Existing BSP parser verifies actual map version, texture mips and texinfo flags. This small diagnostic extends it only to standard BSP29 face polygons, UVs, shared edges and ray probes. No replacement asset bytes are written.'],'coordination':'Root reported Bluey agent_whoami storage_error c10dc outcome unknown automaticRetry false. No board mutation retried or invented identity. Root remains accountable for reconciliation.'}
for path in paths:
 pak=m.Pak(path);b=pak.read('maps/e1m1.bsp');faces,names=geometry(b);palette=pak.read('gfx/palette.lmp');outlabel='shareware' if path==paths[0] else 'base'
 near=[f for f in faces if max(f['bbox'][0][0],-800)<=min(f['bbox'][1][0],400) and max(f['bbox'][0][1],1900)<=min(f['bbox'][1][1],3100) and max(f['bbox'][0][2],-210)<=min(f['bbox'][1][2],200)]
 edge_index={}
 for g in faces:
  for j in range(len(g['vertexIds'])):
   edge=tuple(sorted((g['vertexIds'][j],g['vertexIds'][(j+1)%len(g['vertexIds'])])))
   edge_index.setdefault(edge,[]).append(g)
 for f in near:
  neighbor={}
  for j in range(len(f['vertexIds'])):
   edge=tuple(sorted((f['vertexIds'][j],f['vertexIds'][(j+1)%len(f['vertexIds'])])))
   for g in edge_index[edge]:
    if g['index']!=f['index']:neighbor.setdefault(g['index'],{'face':g['index'],'texture':g['texture'],'sharedEdges':[]})['sharedEdges'].append(list(edge))
  f['sharedEdgeNeighbors']=list(neighbor.values())
 maprow={'source':outlabel,'pack':pak.proof,'member':pak.member_proof('maps/e1m1.bsp'),'bspSha256':m.digest(b),'paletteSha256':m.digest(palette),'nearbyFaces':near,'rayProbes':[],'textures':[]}
 for xyz,yaw,pitch in [([74,1986,-162],93,-27),([-454,2689,-82],89,-21)]:
  maprow['rayProbes'].append({'playerOrigin':xyz,'yaw':yaw,'pitch':pitch,'normalEye22':hit(faces,xyz,yaw,pitch),'originSensitivityEye0':hit(faces,xyz,yaw,pitch,0)})
 selected=sorted(set(f['slot']for f in near if f['texture'] and any(s in f['texture']for s in ['metal','comp','cop','twall','tech','door','light'])))
 for slot in selected:
  native,mips=m.parse_native(b,slot);rgba=b''.join(palette[i*3:i*3+3]+b'\xff'for i in mips[0]);name=native['name'];im=Image.frombytes('RGBA',tuple(native['dimensions']),rgba).convert('RGB');filename=f'{outlabel}-native-{name}.png';im.save(OUT/filename)
  identity={'name':name,'dimensions':native['dimensions'],'paletteSha256':m.digest(palette),'indexedSha256':m.digest(mips[0]),'rgbaSha256':m.digest(rgba),'mipIndexedSha256':[m.digest(x)for x in mips],'materialFlags':native['materialFlags'],'nativeSemantics':{'family':'ordinary-world','alphaIndex255':False,'fullbrightStart':224,'fullbrightMaskSha256':m.digest(bytes(255 if x>=224 else 0 for x in mips[0]))}}
  maprow['textures'].append({'slot':slot,**native,'nativeIdentity':m.canonical_id(identity),'identity':identity,'nativeRGBAsha256':m.digest(rgba),'png':filename,'pngSha256':m.file_sha(OUT/filename)})
 report['maps'].append(maprow)
 print(outlabel, 'nearbyfaces',len(near),'names',sorted(set(f['texture']for f in near)));print(json.dumps(maprow['rayProbes'],indent=1))
# Screenshot crops are unchanged pixels, strictly localized to product content.
for file,box in [('Screenshot 2026-10-21 at 08.09.45.png',(191,475,2747,1430)),('Screenshot 2026-10-21 at 08.10.01.png',(191,390,2747,1430))]:
 source=Path('/Users/bri/Desktop')/file;im=Image.open(source);dest=OUT/('screenshot-'+('080945' if '09.45' in file else '081001')+'-wall-crop.png');im.crop(box).save(dest)
 report['screenshots'].append({'source':str(source),'sha256':m.file_sha(source),'dimensions':list(im.size),'cropBox':box,'crop':dest.name,'cropSha256':m.file_sha(dest)})
(OUT/'scene-proof.json').write_text(json.dumps(report,indent=2)+'\n')
# Native overview leaves each source visible without rendering a simulated runtime.
rows=report['maps'][0]['textures'];w=780;h=math.ceil(len(rows)/3)*280;contact=Image.new('RGB',(w,h),(27,27,27));draw=ImageDraw.Draw(contact)
for k,row in enumerate(rows):
 im=Image.open(OUT/row['png']);im.thumbnail((240,240),Image.Resampling.NEAREST);x=(k%3)*260;y=(k//3)*280;contact.paste(im,(x,y+25));draw.text((x+2,y+4),f"{row['name']} {row['dimensions']}",fill='white')
contact.save(OUT/'shareware-native-contact.png')
