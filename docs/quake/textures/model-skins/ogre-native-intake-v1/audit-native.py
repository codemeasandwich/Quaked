from pathlib import Path
import struct,hashlib,json,datetime,collections
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[5]; OUT=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def file_rec(p):
 p=Path(p); b=p.read_bytes(); r={'file':str(p),'resolved':str(p.resolve()),'bytes':len(b),'sha256':sha(b)}
 try:
  im=Image.open(p);r.update(dimensions=list(im.size),mode=im.mode,format=im.format)
  if p.suffix=='.webp':r['webpChunks']=[b[i+0:i+4].decode('ascii','replace') for i in range(12,len(b)-8) if b[i:i+4] in (b'VP8 ',b'VP8L',b'VP8X')]
 except Exception:pass
 return r
mounts=[]; members={}; occurrences={n:[] for n in ('progs/ogre.mdl','gfx/palette.lmp')}; directories=[]
# Source-web base mounting order is actual main.js: owned pak0 then bundled shareware.
for root in (Path('/Users/bri/quaked/Quake'),ROOT/'games/shareware'):
 names={p.name.lower():p for p in root.iterdir()}; dirs={'root':str(root),'packNames':[p.name for p in root.iterdir() if p.name.lower().startswith('pak')],'loose':{n: {'exists':(root/n).is_file()} for n in occurrences}}
 for n in dirs['loose']:
  if (root/n).is_file():dirs['loose'][n].update(file_rec(root/n))
 directories.append(dirs)
 # Quake base source-web mounts pak0 only. Inventory numbered extras without claiming they mount.
 p=names['pak0.pak']; data=p.read_bytes(); assert data[:4]==b'PACK'; off,l=struct.unpack_from('<II',data,4); assert off>=12 and l%64==0 and off+l<=len(data)
 mounts.append(file_rec(p)); count=l//64
 for i in range(count):
  row=data[off+i*64:off+(i+1)*64];name=row[:56].split(b'\0')[0].decode('ascii').lower();at,size=struct.unpack_from('<II',row,56); assert at+size<=len(data)
  if name in occurrences:
   b=data[at:at+size];r={'pack':str(p),'offset':at,'bytes':size,'sha256':sha(b),'directoryIndex':i};occurrences[name].append(r); members[name]=(b,r)
model,modelRec=members['progs/ogre.mdl']; palette,paletteRec=members['gfx/palette.lmp'];assert len(palette)==768
assert model[:4]==b'IDPO' and struct.unpack_from('<i',model,4)[0]==6
skins,w,h,nv,nt,nf=struct.unpack_from('<6i',model,48);assert min(skins,w,h,nv,nt,nf)>0
header={'magic':'IDPO','version':6,'skinCount':skins,'skinDimensions':[w,h],'vertices':nv,'triangles':nt,'frameHeaders':nf,'synctype':struct.unpack_from('<i',model,72)[0],'flags':struct.unpack_from('<i',model,76)[0]}
pos=84;skinRecords=[]
for skin in range(skins):
 typ=struct.unpack_from('<i',model,pos)[0];pos+=4;count=1;intervals=[]
 if typ!=0:
  count=struct.unpack_from('<i',model,pos)[0];pos+=4;assert count>0;intervals=list(struct.unpack_from('<'+str(count)+'f',model,pos));pos+=4*count
 rec={'skin':skin,'type':typ,'grouped':typ!=0,'frames':count,'intervals':intervals,'images':[]}
 for frame in range(count):
  at=pos;indices=model[pos:pos+w*h];assert len(indices)==w*h;pos+=w*h
  indexed=Image.frombytes('P',(w,h),indices);indexed.putpalette(palette);rgb=indexed.convert('RGB');rgba=indexed.convert('RGBA')
  stem=f'native-skin{skin}-frame{frame}'; indexed.save(OUT/(stem+'-indexed.png'));rgba.save(OUT/(stem+'-rgba.png'));rgb.resize((w*3,h*3),Image.Resampling.NEAREST).save(OUT/(stem+'-nearest3.png'))
  rec['images'].append({'frame':frame,'offset':at,'indexedBytes':len(indices),'indexedSha256':sha(indices),'paletteSha256':sha(palette),'rgbaSha256':sha(rgba.tobytes()),'fullbrightTexels224to255':sum(x>=224 for x in indices),'index255Texels':indices.count(255),'topLeftIndex':indices[0],'indexedPNG':file_rec(OUT/(stem+'-indexed.png')),'rgbaPNG':file_rec(OUT/(stem+'-rgba.png'))})
 skinRecords.append(rec)
stAt=pos;st=[struct.unpack_from('<3i',model,pos+i*12) for i in range(nv)];pos+=nv*12;triAt=pos;tris=[struct.unpack_from('<4i',model,pos+i*16) for i in range(nt)];pos+=nt*16;framesAt=pos
assert all(all(0<=v<nv for v in row[1:]) for row in tris)
poses=[]; frameGroups=[]
for frame in range(nf):
 typ=struct.unpack_from('<i',model,pos)[0];pos+=4;count=1;intervals=[]
 if typ!=0:
  count=struct.unpack_from('<i',model,pos)[0];pos+=12;assert count>0;intervals=list(struct.unpack_from('<'+str(count)+'f',model,pos));pos+=4*count
 frameGroups.append({'frame':frame,'type':typ,'poses':count,'intervals':intervals})
 for pose in range(count):
  at=pos;name=model[pos+8:pos+24].split(b'\0')[0].decode('ascii');pos+=24+nv*4; assert pos<=len(model);poses.append({'frame':frame,'pose':pose,'name':name,'offset':at})
assert pos==len(model)
mask=Image.new('L',(w,h),0);draw=ImageDraw.Draw(mask);overlay=Image.open(OUT/'native-skin0-frame0-rgba.png').convert('RGB').resize((w*3,h*3),Image.Resampling.NEAREST);od=ImageDraw.Draw(overlay);edges=collections.defaultdict(list)
for ti,(front,*verts) in enumerate(tris):
 points=[(st[v][1]+.5+(w/2 if not front and st[v][0] else 0),st[v][2]+.5) for v in verts];draw.polygon(points,fill=255);od.polygon([(x*3,y*3) for x,y in points],outline=(30,190,180))
 for a,b in ((0,1),(1,2),(2,0)):
  key=tuple(sorted((verts[a],verts[b])));uv={verts[a]:points[a],verts[b]:points[b]};edges[key].append({'triangle':ti,'uv':[list(uv[v]) for v in key]})
seams=[]
for key,rows in edges.items():
 if len(rows)>1 and rows[0]['uv']!=rows[1]['uv']:seams.append({'vertices':list(key),'sides':rows})
mask.save(OUT/'native-uv-footprint.png');overlay.save(OUT/'native-uv-overlay-nearest3.png')
# Four-connected native-resolution footprint components, an inspection raster rather than authoritative semantic islands.
px=mask.tobytes();seen=set();components=[]
for at,value in enumerate(px):
 if not value or at in seen:continue
 q=collections.deque([at]);seen.add(at);xs=[];ys=[]
 while q:
  v=q.popleft();x=v%w;y=v//w;xs.append(x);ys.append(y)
  for nx,ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
   u=ny*w+nx
   if 0<=nx<w and 0<=ny<h and px[u] and u not in seen:seen.add(u);q.append(u)
 components.append({'pixels':len(xs),'bbox':[min(xs),min(ys),max(xs)+1,max(ys)+1]})
sourcefiles=['src/engine/render/gl_model_alias.js','src/engine/render/gl_model_common.js','src/engine/render/gl_mesh.js','src/engine/common/pak.js','src/engine/common/game_selection.js','main.js','src/newer/render/r_newerskins.js','tools/texture_sheets/update_enemy_heights.py','tools/texture_sheets/update_head_skins.py','tools/texture_sheets/fit_rogue_skins.py','tools/texture_sheets/finish_runtime_skin.py','tools/texture_sheets/prepare_texture_master.py','tools/texture_sheets/derive_quake_texture_tiers.py','tools/texture_sheets/derive_texture_tiers.py','tools/texture_sheets/sources/fidelity-2026-10-12/ogre-owner-base.json','src/newer/render/gl_normals.js','src/newer/render/normal_math.js','tests/rogue_skin_gpu_trial.html','tests/rogue_skin_gpu_trial.js','tests/rogue_ogre_skin_identity_test.js','assets/game/enemies/index.json','assets/game/packs/games.json','assets/layout.json']
assets=[ROOT/'assets/game/enemies/ogre/custom/diffuse.webp',ROOT/'assets/game/enemies/ogre/custom/height.webp',ROOT/'assets/game/enemies/heights/ogre/skin0_0.webp',ROOT/'assets/game/enemies/ogre/custom/SOURCE.json']
assets+=sorted((ROOT/'assets/authoring/texture_sheets/sources/fidelity-2026-10-12').glob('ogre*'))
identity=sha(json.dumps({'modelSHA256':sha(model),'skin':0,'frame':0,'dimensions':[w,h],'indexedSHA256':skinRecords[0]['images'][0]['indexedSha256'],'paletteSHA256':sha(palette),'rgbaSHA256':skinRecords[0]['images'][0]['rgbaSha256']},sort_keys=True,separators=(',',':')).encode())
report={'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'One original Quake Ogre MDL6/native skin intake; not all model/skin/expansion coverage or artwork acceptance','identityPolicy':'Intake identity is SHA256 of canonical compact sorted JSON(modelSHA256,skin,frame,dimensions,indexedSHA256,paletteSHA256,rgbaSHA256), explicitly local proof identity; runtime matches full MDL SHA256.','intakeNativeIdentity':identity,'mountProfile':'Current source-web Quake base only: owner Quake pak0 mounted first, bundled shareware pak0 last and wins; COM_FindFile packs precede preloaded virtual loose. Actual filesystem loose candidates also checked absent. Desktop/other running profiles not exercised.','directories':directories,'mounts':mounts,'occurrences':occurrences,'effectiveModel':modelRec,'effectivePalette':paletteRec,'header':header,'skinGroups':skinRecords,'frameGroups':frameGroups,'poses':poses,'parse':{'stOffset':stAt,'trianglesOffset':triAt,'framesOffset':framesAt,'endOffset':pos,'fileBytes':len(model),'exactEnd':pos==len(model)},'uv':{'formula':'s=(s+.5+(width/2 if !facesfront && onseam else0))/width, t=(t+.5)/height; top-row-first texture flipY=false','onSeamVertices':sum(bool(s[0]) for s in st),'frontTriangles':sum(bool(t[0]) for t in tris),'backTriangles':sum(not t[0] for t in tris),'meshEdges':len(edges),'edgeAdjacencyHistogram':dict(collections.Counter(len(v) for v in edges.values())),'discontinuousUVEdgeCount':len(seams),'discontinuousUVEdges':seams,'footprintPixels':sum(bool(x) for x in px),'nativeRasterComponents':sorted(components,key=lambda c:-c['pixels']),'rasterCaveat':'Pillow polygon footprint follows existing uv_footprint formula; native connected components are a raster inspection aid, not artist/anatomical island identities. Mesh-edge correspondences define continuity, not image perimeter repeats.'},'requiredTiers':{'Low':[w,h],'Mid4x':[w*4,h*4],'High8x':[w*8,h*8],'current1254squareReturnAdequateForHigh':1254>=w*8 and 1254>=h*8,'noUpscaling':True},'existingAssets':[file_rec(p) for p in assets if p.is_file()],'sourceBindings':[file_rec(ROOT/p) for p in sourcefiles],'diagnosticFiles':[file_rec(p) for p in OUT.glob('*.png')],'newProviderCalls':0,'writes':'Only owned Ogre intake proof folder; raw native extraction and diagnostic images, no runtime/official/authoring asset writes'}
(OUT/'native-intake.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['intakeNativeIdentity','effectiveModel','effectivePalette','header','requiredTiers']},indent=2));print('skin group frames',[(x['skin'],x['type'],x['frames']) for x in skinRecords]);print('uv', {k:report['uv'][k] for k in ['onSeamVertices','frontTriangles','backTriangles','discontinuousUVEdgeCount','footprintPixels','nativeRasterComponents']})
