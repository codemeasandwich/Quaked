"""Fix face/mortar labels from actual registered RGB before reading scalar height."""
from pathlib import Path
from PIL import Image,ImageDraw
import json,hashlib,datetime
R=Path(__file__).resolve().parents[5];H=Path(__file__).parent;O=H/'master-draft-review';O.mkdir(exist_ok=True)
p=R/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-005/TF_Brick1_01/master-draft-v1/color.png';im=Image.open(p).convert('RGB')
samples=[('warm-clay-face','face',[50,20,90,40]),('ochre-clay-face','face',[720,20,750,40]),('pale-mineral-brick-face','face',[280,85,310,100]),('dark-stained-solid-brick-face','face',[330,210,365,230]),('green-stained-solid-brick-face','face',[80,660,105,680]),('dark-solid-brick-c12','face',[450,790,475,815]),('horizontal-mortar-c0-c1','mortar',[350,61,380,66]),('horizontal-mortar-c3-c4','mortar',[350,246,380,252]),('vertical-mortar-c1','mortar',[257,85,261,105]),('horizontal-mortar-c6-c7','mortar',[420,445,450,450])]
rows=[{'label':a,'classification':b,'rectMasterPixelEdges':c,'classificationBasis':'Actual registered RGB viewed at1:1 before height input; solidface interiors or physical joint contact.'} for a,b,c in samples]
report={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'RGB-only semantic witness classification BEFORE scalar height read','registeredRGB':{'file':str(p.relative_to(R)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()},'samples':rows,'physicalRequirement':'All warm/pale/dark/green clay brick faces lie above recessed mortar. Staining is not a hole. No layer/mask/height acceptance implied.'}
(H/'draft-rgb-witnesses.json').write_text(json.dumps(report,indent=2)+'\n')
context=im.copy();dr=ImageDraw.Draw(context);contact=Image.new('RGB',(800,320),(32,32,32));dc=ImageDraw.Draw(contact)
for i,row in enumerate(rows):
 box=tuple(row['rectMasterPixelEdges']);colour=(255,255,0) if row['classification']=='face' else (255,0,255);dr.rectangle(box,outline=colour,width=1);dr.text((box[0],max(0,box[1]-10)),str(i+1),fill=colour)
 x=(i%5)*160;y=(i//5)*160;crop=im.crop(box);crop.thumbnail((140,100));contact.paste(im.crop(box).resize((140,100),Image.Resampling.NEAREST),(x,y+30));dc.text((x+2,y+2),str(i+1)+' '+row['label'],fill='white')
context.save(O/'rgb-witness-context.png');contact.save(O/'rgb-witness-contact.png');print(json.dumps({'witnesses':str((H/'draft-rgb-witnesses.json').relative_to(R)),'heightInputRead':False}))
