"""Bind the five-material schema3 review to already checked delivered maps.

A fresh public review CLI replay runs in temporary storage. Independent complete
canvases are also painted from decoded delivered files: no production panel
helper is imported, and master-to-tier mathematics is not rerun by this oracle.
"""
import argparse
import datetime
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import traceback

import numpy as np
import PIL
from PIL import Image, ImageDraw, features

ROOT=Path(__file__).resolve().parents[3]
CLI=ROOT/'tools/texture_sheets/build_quake_texture_batch_review.py'
BATCH=ROOT/'docs/quake/textures/codec-transition-batch-v1.json'
REVIEW=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/codec-transition-v1-review'
ACTUAL=ROOT/'docs/quake/textures/codec-transition-actual-public.json'
ART=ROOT/'docs/quake/textures/parallel-020/root-independent-art-before-codec.json'
ROLES=('diffuse','height','normalX','normalY','normalZ')
NAMES=('church1','maya1_9','city8_2','rock3_2','wwall1_1')
sha=lambda b:hashlib.sha256(b).hexdigest()


def need(ok,msg):
    if not ok:raise AssertionError(msg)


def path(value):
    p=(ROOT/value).resolve();p.relative_to(ROOT);return p


def bind(p):return {'file':str(Path(p).resolve().relative_to(ROOT)),'sha256':sha(Path(p).read_bytes())}


def jpeg(image):
    stream=io.BytesIO();image.save(stream,'JPEG',quality=92);return stream.getvalue()


def colour_canvas(name,tier,original,diffuse):
    # This bounded dataset has native64/128 square textures. Its required layout
    # is fixed1400x1100; failing the dataset assumption rejects, never stretches.
    need(original.size in((64,64),(128,128)),'Unexpected bounded native canvas assumption')
    sheet=Image.new('RGB',(1400,1100),(28,30,33));draw=ImageDraw.Draw(sheet)
    draw.text((12,8),f'{name} {tier}: unchanged native (left), actual Q92 (middle), 1:1 detail (right)',fill='white')
    sheet.paste(original.resize((512,512),Image.Resampling.NEAREST),(12,32))
    sheet.paste(diffuse.resize((512,512),Image.Resampling.LANCZOS),(540,32))
    centre=(diffuse.width//2,diffuse.height//2)
    sheet.paste(diffuse.crop((centre[0]-128,centre[1]-128,centre[0]+128,centre[1]+128)),(1068,32))
    tile=diffuse.resize((256,256),Image.Resampling.LANCZOS)
    for y in(570,826):
        for x in(12,268):sheet.paste(tile,(x,y))
    for divisor,y in((2,570),(4,805)):
        dims=(original.width//divisor,original.height//divisor)
        draw.text((540,y),f'Both at native/{divisor} {dims}: original / {tier}',fill='white')
        size=(dims[0]*3,dims[1]*3)
        sheet.paste(original.resize(dims,Image.Resampling.BOX).resize(size,Image.Resampling.NEAREST),(540,y+25))
        sheet.paste(diffuse.resize(dims,Image.Resampling.BOX).resize(size,Image.Resampling.NEAREST),(550+size[0],y+25))
    return sheet


def relief_canvas(name,tier,maps):
    vector=np.stack([np.asarray(maps['normal'+c],dtype=float)[:,:,0]for c in'XYZ'],2)/127.5-1
    vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
    normal=Image.fromarray(np.uint8(np.clip((vector*.5+.5)*255,0,255)))
    entries=[('Decoded height',maps['height']),('Decoded XYZ normals',normal)]
    colour=np.asarray(maps['diffuse'],dtype=float)
    for label,direction in(('Opposed light A',np.array([.6,.3,.75])),('Opposed light B',np.array([-.6,-.3,.75]))):
        direction/=np.linalg.norm(direction)
        light=.35+.65*np.clip((vector*direction).sum(2),0,1)
        entries.append((label,Image.fromarray(np.uint8(np.clip(colour*light[:,:,None],0,255)))))
    sheet=Image.new('RGB',(1200,1100),(28,30,33));draw=ImageDraw.Draw(sheet)
    for i,(label,image)in enumerate(entries):
        x,y=(i%2)*600,(i//2)*550
        draw.text((x+10,y+8),name+' '+tier+' '+label,fill='white')
        image=image.copy();image.thumbnail((512,512));sheet.paste(image,(x+10,y+30))
    return sheet


class Markup(HTMLParser):
    def __init__(self):super().__init__();self.headers={'h1':[],'h2':[],'h3':[]};self.current=None;self.text=[];self.images=[]
    def handle_starttag(self,tag,attrs):
        if tag in self.headers:self.current=tag;self.headers[tag].append('')
        if tag=='img':self.images.append(dict(attrs))
    def handle_endtag(self,tag):
        if tag==self.current:self.current=None
    def handle_data(self,data):
        self.text.append(data)
        if self.current:self.headers[self.current][-1]+=data


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--report',type=Path,required=True);args=parser.parse_args()
    need(not args.report.exists()and not args.report.is_symlink(),'Never overwrite evidence')
    watched={}
    def read(p):
        p=Path(p).resolve();p.relative_to(ROOT);b=p.read_bytes()
        need(p not in watched or watched[p]==sha(b),'Input changed during review verification');watched[p]=sha(b);return b
    def load(p):return json.loads(read(p))
    report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'verdict':'HOLD review verification incomplete','scope':'Five actual schema3 packages and their20JPEG+HTML review; reuse existing50-map codec PASS without another independent master-to-tier derivation.',
        'verifier':bind(__file__),'batch':bind(BATCH),'actualCodecProof':bind(ACTUAL),'reviewCLI':bind(CLI),
        'environment':{'python':sys.version,'executable':sys.executable,'Pillow':PIL.__version__,'NumPy':np.__version__,'WebP':features.version('webp')},
        'items':[],'counts':{'materials':0,'tierMapBindings':0,'independentPanelCanvases':0,'publicCLIReplayFiles':0},
        'emptyJPEGTailAllowanceUsed':False,
        'limits':['Independent panel oracle is deliberately bounded to these actual64/128square natives; it is not a generic authoring/layout library.',
                  'Full JPEG bytes and decoded pixels must match; no JPEG-tail allowance or numerical image tolerance is used.',
                  'Prior codec proof supplies master-to-tier mathematics; this supplement independently checks bindings, actual decoded panel construction and public CLI replay.',
                  'Source/native/material/edge/physical-relief/runtime/owner/landing/release acceptance remain separate; three X-seam ART HOLDs are retained.']}
    try:
        read(Path(__file__));read(CLI)
        for p in [ROOT/'tools/texture_sheets/build_texture_batch_review.py',ROOT/'tools/texture_sheets/derive_quake_texture_tiers.py',ROOT/'tools/texture_sheets/derive_texture_tiers.py',ROOT/'tools/craft_normals.py']:read(p)
        batch,actual,art=load(BATCH),load(ACTUAL),load(ART)
        need(actual['verdict'].startswith('PASS')and actual['counts']['newFiles']==50,'Actual codec proof absent')
        need(tuple(x['name']for x in batch['items'])==NAMES,'Wrong actual material scope')
        policy={r:({'lossless':False,'quality':92,'method':6}if r=='diffuse'else{'lossless':True,'compressionEffort':92,'method':6})for r in ROLES}
        need(batch['schemaVersion']==3 and batch['family']=='quake'and batch['pathsBase']=='repository'
             and batch['defaultTier']=='Mid'and batch['tierFactors']=={'Mid':4,'High':8}
             and batch['encodingByRole']==policy and 'lossless'not in batch and'quality'not in batch,'Contradictory review policy')
        held={x['texture']:x['artVerdict']for x in art['textures']}
        need(held=={n:'HOLD'for n in NAMES[2:]},'Three retained art HOLDs differ');report['artHolds']={'proof':bind(ART),'materials':held,'changed':False}
        codec={x['name']:x for x in actual['items']};expected_files={'index.html'}
        for item in batch['items']:
            name=item['name'];source=codec[name]
            for desc,proof in [('masterPackage','masterPackage'),('tierReceipt','newManifest')]:
                p=path(item[desc]);need(p==path(source[proof]['file'])and sha(read(p))==item[desc+'Sha256']==source[proof]['sha256'],'Descriptor/source package binding differs')
            need(path(item['original'])==path(source['original']['file'])and sha(read(path(item['original'])))==source['original']['sha256'],'Descriptor/native binding differs')
            need(item['nativeIdentity']['id']==source['nativeIdentity'],'Native identity scope differs')
            master=load(path(item['masterPackage']));manifest=load(path(item['tierReceipt']))
            for row in [*master['inputs'].values(),*master['tools'].values(),*manifest['tools'].values()]:
                need(sha(read(path(row['file'])))==row['sha256'],'Source/producer binding changed')
            for key in('master','heightMaster'):
                row=manifest['inputs'][key];need(sha(read(path(row['file'])))==row['sha256'],'Master bytes changed')
            original=Image.open(path(item['original'])).convert('RGB')
            need([item['nativeIdentity']['width'],item['nativeIdentity']['height']]==list(original.size),'Native size differs')
            tiers=[]
            for tier,factor in(('Mid',4),('High',8)):
                row=item['tiers'][tier];checked=source['tiers'][tier]
                need(row['factor']==checked['factor']==factor and row['dimensions']==checked['dimensions'],'Tier factor/dimensions differ')
                need(set(row['files'])==set(ROLES),'Tier roles differ')
                maps={};maprows=[]
                for proofrow in checked['outputs']:
                    role=proofrow['role'];p=path(row['files'][role]);need(p==path(proofrow['file'])and sha(read(p))==proofrow['sha256'],'Actual map differs from codec PASS')
                    maps[role]=Image.open(p).convert('RGB');maprows.append({'role':role,**bind(p)});report['counts']['tierMapBindings']+=1
                canvases={'review':colour_canvas(name,tier,original,maps['diffuse']),'relief':relief_canvas(name,tier,maps)}
                sheets=[]
                for kind,canvas in canvases.items():
                    filename=name+'-'+tier.lower()+'-'+kind+'.jpg';expected_files.add(filename)
                    p=REVIEW/filename;payload=read(p);expected=jpeg(canvas)
                    need(payload==expected,'Independent complete review canvas JPEG differs: '+filename)
                    decoded=Image.open(io.BytesIO(payload)).convert('RGB');oracle=Image.open(io.BytesIO(expected)).convert('RGB')
                    need(decoded.size==canvas.size and decoded.tobytes()==oracle.tobytes(),'Actual decoded panel raster differs')
                    sheets.append({**bind(p),'dimensions':list(decoded.size),'decodedRGBSha256':sha(decoded.tobytes()),
                        'exactIndependentCanvasJPEGBytes':True,'exactIndependentDecodedPixels':True,'panels':'Native/colour/1:1/2x2repeat/BOTHnative2+4BOX/labels'if kind=='review'else'Decodedheight/normalizedXYZ/twoopposedlights/labels'})
                    report['counts']['independentPanelCanvases']+=1
                tiers.append({'name':tier,'actualMapBindings':maprows,'sheets':sheets})
            report['items'].append({'name':name,'nativeIdentity':source['nativeIdentity'],'masterPackage':source['masterPackage'],'tierReceipt':source['newManifest'],
                'tiers':tiers,'artStatus':'HOLD unchanged'if name in held else'Coordinator actual ART review remains separate'})
            report['counts']['materials']+=1
        need({p.name for p in REVIEW.iterdir()if p.is_file()}==expected_files,'Root review has missing/extra files')
        html=read(REVIEW/'index.html');markup=Markup();markup.feed(html.decode())
        need(markup.headers['h1']==['Quake: shared-master Mid4× / High8× review'],'HTML heading differs')
        need(markup.headers['h2']==[x['name']+' / '+x['edition']for x in batch['items']],'HTML material labels differ')
        headings=[tier+(' (default)'if tier=='Mid'else'')+' '+str(item['tiers'][tier]['dimensions'])for item in batch['items']for tier in('Mid','High')]
        need(markup.headers['h3']==headings,'HTML tier/default labels differ')
        text=''.join(markup.text)
        need('Colour is lossy WebP Q92/method6; height and XYZ normals are lossless WebP/method6 with exact exported8-bit channels.'in text
             and'Low is unchanged.'in text and'Float quantization is distinct from compression.'in text
             and'Offline review, not game integration or owner acceptance.'in text and'Every enhanced map is lossy'not in text,'HTML whole policy differs')
        need({x['src']for x in markup.images}==expected_files-{'index.html'}and len(markup.images)==20,'HTML image bindings differ')
        report['HTML']={**bind(REVIEW/'index.html'),'defaultMidMaterials':5,'mixedCodecPolicyExact':True,'all20ImageBindingsExact':True}
        with tempfile.TemporaryDirectory(prefix='quake-actual-review-replay-')as tmp:
            output=Path(tmp)/'review'
            command=[sys.executable,str(CLI),'--batch',str(BATCH),'--paths-root',str(ROOT),'--output',str(output)]
            result=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=240,check=False)
            report['publicCLIReplay']={'command':command,'returnCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'temporaryOutputRemovedAfterHashComparison':True}
            need(result.returncode==0,'Public review replay failed')
            need({p.name for p in output.iterdir()}==expected_files,'Replay output count differs')
            for filename in sorted(expected_files):need((output/filename).read_bytes()==read(REVIEW/filename),'Exact public replay differs: '+filename)
            report['counts']['publicCLIReplayFiles']=len(expected_files)
        for p,digest in watched.items():need(sha(p.read_bytes())==digest,'Source/review changed during verification')
        report['watchedInputs']={'files':len(watched),'allByteHashesUnchanged':True}
        report['verdict']='PASS bounded actual schema3 review bindings, independent decoded panel canvases and exact public CLI replay; ART HOLDs unchanged'
    except Exception as error:
        report['verdict']='HOLD actual review verification failed';report['failure']={'type':type(error).__name__,'message':str(error)};traceback.print_exc()
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with args.report.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'verdict':report['verdict'],'counts':report['counts'],'report':str(args.report)}));return 0 if report['verdict'].startswith('PASS')else 1


if __name__=='__main__':raise SystemExit(main())
