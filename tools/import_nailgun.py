"""Source-faithful MDL/MD3 nailgun conversion into Quaked's existing weapon JSON.
No game code, native PAK, previous weapon models or donor archives are changed.
"""
from pathlib import Path
import zipfile,struct,json,hashlib,ast,re,io,argparse
import numpy as np
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);cfg=p.parse_args();cfg.out.mkdir(parents=True,exist_ok=True)
text=(cfg.root/'src/anorm_dots.js').read_text();table=np.array(ast.literal_eval(re.search(r'export const r_avertexnormals = (\[.*?\]);',text,re.S).group(1)))
def winding(points,normals,triangles):
 tris=np.array(triangles);cross=np.cross(points[tris[:,1]]-points[tris[:,0]],points[tris[:,2]]-points[tris[:,0]]);dot=(cross*normals[tris].mean(1)).sum(1);valid=np.linalg.norm(cross,axis=1)>1e-8
 reverse=np.median(dot[valid])<0
 return tris[:,[0,2,1]] if reverse else tris,reverse,{'positive':int((dot[valid]>0).sum()),'negative':int((dot[valid]<0).sum()),'degenerate':int((~valid).sum())}
def mdl(data):
 assert data[:4]==b'IDPO' and struct.unpack_from('<i',data,4)[0]==6
 scale=np.array(struct.unpack_from('<3f',data,8));origin=np.array(struct.unpack_from('<3f',data,20));skins,w,h,nv,nt,nf=struct.unpack_from('<6i',data,48);off=84
 for i in range(skins):
  kind=struct.unpack_from('<i',data,off)[0];assert kind==0;off+=4+w*h
 st=np.array([struct.unpack_from('<3i',data,off+i*12)for i in range(nv)]);off+=nv*12
 tris=np.array([struct.unpack_from('<4i',data,off+i*16)for i in range(nt)]);off+=nt*16
 positions=[];normals=[];names=[]
 for frame in range(nf):
  assert struct.unpack_from('<i',data,off)[0]==0;names.append(data[off+12:off+28].split(b'\0')[0].decode());off+=28;a=np.frombuffer(data,np.uint8,nv*4,off).reshape(nv,4);positions.append(a[:,:3]*scale+origin);normals.append(table[a[:,3]]);off+=nv*4
 assert off==len(data)
 # Duplicate only seam variants; UVs retain the half-texel native convention.
 vertices=[];uv=[];lookup={};indices=[]
 for tri in tris:
  face=[]
  for v in tri[1:]:
   seam=bool(not tri[0] and st[v,0]);key=(int(v),seam)
   if key not in lookup:
    lookup[key]=len(vertices);vertices.append(int(v));uv.extend([(st[v,1]+(w/2 if seam else 0)+.5)/w,(st[v,2]+.5)/h])
   face.append(lookup[key])
  indices.append(face)
 pos=[a[vertices]for a in positions];norm=[a[vertices]for a in normals];indices,reverse,sign=winding(pos[0],norm[0],indices)
 return {'poses':[a.flatten().tolist()for a in pos],'normals':[a.flatten().tolist()for a in norm],'uv':uv,'indices':indices.flatten().tolist()}, {'format':'MDL6','sourceVertices':nv,'vertices':len(vertices),'triangles':nt,'frames':nf,'frameNames':names,'sourceVertexForEmitted':vertices,'seamVariants':[{'sourceVertex':v,'backSeam':seam,'emitted':idx}for (v,seam),idx in lookup.items()],'reverseWinding':bool(reverse),'normalOrientation':sign}
def md3(data):
 assert data[:4]==b'IDP3' and struct.unpack_from('<i',data,4)[0]==15
 flags,nf,tags,surfaces,skins,frames,tagsOff,surf,end=struct.unpack_from('<9i',data,72);assert surfaces==1 and end==len(data)
 ident,name,flags,snf,shaders,nv,nt,triOff,shaderOff,stOff,xyzOff,send=struct.unpack_from('<4s64s10i',data,surf);assert snf==nf
 shader=data[surf+shaderOff:surf+shaderOff+64].split(b'\0')[0].decode();uv=np.array([struct.unpack_from('<2f',data,surf+stOff+i*8)for i in range(nv)]);tris=np.array([struct.unpack_from('<3i',data,surf+triOff+i*12)for i in range(nt)]);pos=[];norm=[]
 for frame in range(nf):
  vals=np.array([struct.unpack_from('<3hH',data,surf+xyzOff+(frame*nv+i)*8)for i in range(nv)]);pos.append(vals[:,:3]/64);lat=(vals[:,3]>>8)*2*np.pi/256;lng=(vals[:,3]&255)*2*np.pi/256;norm.append(np.column_stack([np.cos(lat)*np.sin(lng),np.sin(lat)*np.sin(lng),np.cos(lng)]))
 tris,reverse,sign=winding(pos[0],norm[0],tris)
 return {'poses':[a.flatten().tolist()for a in pos],'normals':[a.flatten().tolist()for a in norm],'uv':uv.flatten().tolist(),'indices':tris.flatten().tolist()}, {'format':'MD3v15','sourceVertices':nv,'vertices':nv,'triangles':nt,'frames':nf,'shader':shader,'sourceVertexForEmitted':list(range(nv)),'reverseWinding':bool(reverse),'normalOrientation':sign}
z=zipfile.ZipFile(cfg.archive);records={}
for role,entry,decode in [('v_nail','progs/v_nail.mdl',mdl),('g_nail','progs/g_nail.mdl',md3)]:
 raw=z.read(entry);asset,info=decode(raw);asset.update({'version':1,'fitKind':'source-quake-coordinates','transform':{'scale':[1,1,1],'offset':[0,0,0]}});file=cfg.out/(role+'.json');file.write_text(json.dumps(asset,separators=(',',':'))+'\n');points=np.array(asset['poses'][0]).reshape(-1,3)
 records[role]={**info,'archiveEntry':entry,'sourceSHA256':hashlib.sha256(raw).hexdigest(),'outputSHA256':hashlib.sha256(file.read_bytes()).hexdigest(),'sourceBounds':{'min':points.min(0).tolist(),'max':points.max(0).tolist()},'transform':asset['transform']}
# Each source atlas stays separate; held's old-name normal atlas does not match.
textures={'nailgun':{'diffuse':('progs/v_nail.mdl_0.png','diffuse.png')},'nailgun_pickup':{'diffuse':('textures/g_nail.tga','diffuse.png'),'normal':('textures/g_nail_norm.tga','normal.png')}}
for source,maps in textures.items():
 folder=cfg.out/source;folder.mkdir(exist_ok=True)
 for kind,(entry,file)in maps.items():
  raw=z.read(entry);target=folder/file
  if entry.endswith('.png'):target.write_bytes(raw)
  else:Image.open(io.BytesIO(raw)).convert('RGB').save(target)
  maps[kind]={'archiveEntry':entry,'file':file,'sourceSHA256':hashlib.sha256(raw).hexdigest(),'outputSHA256':hashlib.sha256(target.read_bytes()).hexdigest()}
proof={'archive':str(cfg.archive),'models':records,'textures':textures,'heldNormalPolicy':'Authored MDL vertex normals retained; incompatible textures/v_nail_norm.tga atlas is not bound.','mapping':'Identity Quake coordinates and source pose index; seam duplication and CCW winding conversion only.'};(cfg.out/'provenance.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({role:{k:v[k]for k in ['format','vertices','triangles','frames','reverseWinding','sourceBounds']}for role,v in records.items()},indent=2))
