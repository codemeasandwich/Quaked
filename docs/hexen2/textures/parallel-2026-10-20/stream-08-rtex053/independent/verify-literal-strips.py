"""Independent author-strip replay plus full [34,64) X and complete-width Y diagnostics."""
from pathlib import Path
import io,json,hashlib,datetime
import numpy as np
from PIL import Image,ImageDraw
D=Path(__file__).parent;R=next(p for p in D.parents if (p/'tools/texture_sheets').is_dir());B=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-08-rtex053';E=D/'literal-strips';E.mkdir(exist_ok=False)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();ref=lambda p:{'file':str(p.relative_to(R)),'sha256':sha(p)}
frozen=json.loads((D.parent/'handoff.json').read_text())['frozenCandidateInputs'];assert all(sha(R/p)==h for p,h in frozen.items());ap=D.parent/'literal-strip-provenance.json';assert sha(ap)=='5d34202669f6c7eedf17174e78af166eaa7957dce5601241ff59402615b53f9c';auth=json.loads(ap.read_text());item,=json.loads((B/'batch.json').read_text())['items'];native=Image.open(R/item['original']).convert('RGB');na=np.asarray(native);nX=np.roll(na,32,axis=1)[34:64];nY=np.roll(na,32,axis=0)[24:40];Image.fromarray(nX).save(E/'native-X-full-lower-1to1.png');Image.fromarray(nY).save(E/'native-Y-full-width-1to1.png');records=[]
def png(im):
 s=io.BytesIO();im.save(s,'PNG');return s.getvalue()
for tier,f in [('Mid',4),('High',8)]:
 w=64*f;maps={k:np.asarray(Image.open(R/p).convert('RGB')) for k,p in item['tiers'][tier]['files'].items()};N=np.stack([maps['normal'+c][:,:,0] for c in 'XYZ'],2)/127.5-1;N/=np.maximum(np.linalg.norm(N,axis=2,keepdims=True),1e-12);xyz=np.uint8(np.clip((N*.5+.5)*255,0,255));roles={'color':maps['diffuse'],'height':maps['height'],'XYZ':xyz};photo={}
 for sign in (-1,1):
  L=np.array([sign*.6,sign*.3,.75]);L/=np.linalg.norm(L);gain=.35+.65*np.clip((N*L).sum(2),0,1);photo[sign]=np.uint8(maps['diffuse']*gain[:,:,None]);roles['textured-light-'+str(sign)]=photo[sign];roles['neutral-light-'+str(sign)]=np.repeat(np.uint8(gain*210)[:,:,None],3,axis=2)
 for role,a in roles.items():
  x=np.roll(a,w//2,axis=1)[34*f:64*f,:];y=np.roll(a,w//2,axis=0)[w//2-8*f:w//2+8*f,:];Image.fromarray(x).save(E/(tier.lower()+'-X-full-lower-'+role+'-1to1.png'));Image.fromarray(y).save(E/(tier.lower()+'-Y-full-width-'+role+'-1to1.png'))
 # Same native extent on left, never resample enhanced pixels on right.
 nx=np.repeat(np.repeat(nX,f,axis=0),f,axis=1);actual=np.roll(maps['diffuse'],w//2,axis=1)[34*f:64*f];canvas=Image.new('RGB',(2*w+24,30*f+36),(25,27,30));dr=ImageDraw.Draw(canvas);dr.text((4,4),'Native nearest only [34,64)',fill='white');dr.text((w+16,4),tier+' actual1:1 [34,64)',fill='white');canvas.paste(Image.fromarray(nx),(4,24));canvas.paste(Image.fromarray(actual),(w+16,24));canvas.save(E/(tier.lower()+'-X-native-full-lower-comparison.png'))
 # Independently reconstruct exact author canvases/content/labels from pinned role files.
 parts=[('Actual Q92 RGB',maps['diffuse']),('Actual Q92 height',maps['height']),('Actual decoded XYZ',xyz),('Decoded XYZ opposed light -1',photo[-1]),('Decoded XYZ opposed light 1',photo[1])];canvases=[]
 for axis in ['X','Y']:
  rh=(29 if axis=='X' else 16)*f+28;sheet=Image.new('RGB',(w+8,rh*5),(25,27,30));draw=ImageDraw.Draw(sheet)
  for j,(label,a) in enumerate(parts):
   if axis=='X':crop=np.roll(a,w//2,axis=1)[34*f:63*f];text=tier+' X lower-course '+label+' at 1:1'
   else:crop=np.roll(a,w//2,axis=0)[w//2-8*f:w//2+8*f];text=tier+' Y full-width '+label+' at 1:1'
   draw.text((4,j*rh+4),text,fill='white');sheet.paste(Image.fromarray(crop),(4,j*rh+24))
  name=tier.lower()+'-literal-'+axis+('-lower-course.png' if axis=='X' else '-full-width.png');p=D.parent/name;assert png(sheet)==p.read_bytes(),(name,'author literal content/labels differ');canvases.append({'axis':axis,'file':ref(p),'fullPNGBytesExact':True,'enhancedResampled':False,'nativeExtent':'x full0..64, y[34,63)' if axis=='X' else 'x full0..64, y[-8,8)wrapped'})
 for role,q in auth['tiers'][tier]['sourceFiles'].items():assert q['file']==item['tiers'][tier]['files'][role] and sha(R/q['file'])==q['sha256']
 for p,h in auth['tiers'][tier]['views'].items():assert sha(R/p)==h
 records.append({'tier':tier,'factor':f,'authorCanvasReplays':canvases,'independentExtendedXExtent':'full width0..64, y[34,64)includes bottommost native row','independentYExtent':'fullwidth0..64, y[-8,8)wrapped','inputMaps':[ref(R/p) for p in item['tiers'][tier]['files'].values()]})
assert all(sha(R/p)==h for p,h in frozen.items());report={'schemaVersion':1,'verdict':'PASS exact author literal strip content/labels/source bindings plus independent full-width extended strips; ART separate','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'authorProvenance':ref(ap),'code':ref(Path(__file__)),'scopeClarification':'Author X code uses end-exclusive y[34,63), not bottommost native row63. Independent extension explicitly covers y[34,64), and full-width Y includes bottom/top boundary. No crop omission is used to accept a seam.','records':records,'artifacts':[ref(p) for p in sorted(E.iterdir())],'inputsStable':True};(D/'literal-strip-proof-v1.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'receipt':ref(D/'literal-strip-proof-v1.json'),'artifacts':len(report['artifacts'])}))
