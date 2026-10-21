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


def panel_boxes(kind,side,width):
    if kind=='review':
        return {'labelsAndOverviews':[0,0,width,552],
                'repeatedMaterialAndCorners':[8,566,528,1084],
                'bothDistanceComparisonsAndLabels':[536,566,1060,950]}
    return {'topLabels':[0,0,width,26],'lowerLabels':[0,548,width,576],
            'height':[10,30,10+side,30+side],'XYZ':[610,30,610+side,30+side],
            'lightA':[10,580,10+side,580+side],'lightB':[610,580,610+side,580+side]}


def compare_jpeg(actual,expected,canvas,kind,side):
    a=Image.open(io.BytesIO(actual)).convert('RGB');b=Image.open(io.BytesIO(expected)).convert('RGB')
    need(a.size==b.size==canvas.size,'JPEG canvas dimensions differ')
    aa,bb=np.asarray(a),np.asarray(b);h,w=aa.shape[:2]
    mask=np.zeros((h,w),dtype=bool);mask[h-16:,w-40:]=True
    need(np.all(np.asarray(canvas)[mask]==np.array([28,30,33])),
         'Documented JPEG-tail allowance is not empty in this independent canvas')
    # Same narrow40x16 blank-corner policy as the retained wwall verifier.
    # Header changes and appended metadata are not an empty-tail allowance.
    need(actual.endswith(b'\xff\xd9')and expected.endswith(b'\xff\xd9'),'JPEG does not end at EOI')
    sos_a,sos_b=actual.find(b'\xff\xda'),expected.find(b'\xff\xda')
    need(sos_a>0 and sos_a==sos_b and actual[:sos_a]==expected[:sos_b],'JPEG headers differ')
    scan_a=int.from_bytes(actual[sos_a+2:sos_a+4],'big');scan_b=int.from_bytes(expected[sos_b+2:sos_b+4],'big')
    need(scan_a==scan_b and actual[:sos_a+2+scan_a]==expected[:sos_b+2+scan_b],
         'JPEG scan headers differ')
    changed=np.any(aa!=bb,axis=2)
    need(not np.any(changed&~mask),'Decoded review pixels differ outside documented empty JPEG tail')
    panels=[]
    for label,(x0,y0,x1,y1)in panel_boxes(kind,side,w).items():
        need(not mask[y0:y1,x0:x1].any(),'JPEG-tail allowance overlaps protected '+label)
        need(np.array_equal(aa[y0:y1,x0:x1],bb[y0:y1,x0:x1]),'Material/label panel differs: '+label)
        panels.append({'name':label,'rectangle':[x0,y0,x1,y1],
                       'decodedRGBSha256':sha(aa[y0:y1,x0:x1].tobytes()),'exact':True})
    ys,xs=np.where(changed)
    return {'wholeJPEGBytesExact':actual==expected,'decodedRGBSha256':sha(aa.tobytes()),
            'everyPixelOutsideEmptyTailExact':True,'panels':panels,'changedPixels':int(changed.sum()),
            'changedRectangle':None if not changed.any()else[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)],
            'allowedEmptyTailRectangle':[w-40,h-16,w,h],
            'maximumChannelDifference':int(np.abs(aa.astype('int16')-bb).max())}


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
                  'Exact whole-JPEG identity is reported where true. Otherwise only the previously documented40x16 empty bottom-right JPEG tail is allowed; every decoded pixel outside it, all material/label rectangles, JPEG headers and whole HTML must match exactly. No numerical material tolerance is used.',
                  'Prior codec proof supplies master-to-tier mathematics; this supplement independently checks bindings, actual decoded panel construction and public CLI replay.',
                  'Source/native/material/edge/physical-relief/runtime/owner/landing/release acceptance remain separate; three X-seam ART HOLDs are retained.']}
    try:
        read(Path(__file__));read(CLI)
        for p in [ROOT/'tools/texture_sheets/build_texture_batch_review.py',ROOT/'tools/texture_sheets/derive_quake_texture_tiers.py',ROOT/'tools/texture_sheets/derive_texture_tiers.py',ROOT/'tools/craft_normals.py']:read(p)
        batch,actual,art=load(BATCH),load(ACTUAL),load(ART)
        policy_sources=[ROOT/'skills/quaked-texture-authoring/references/repairs-and-verification.md',
                        ROOT/'docs/quake/textures/parallel-020/wwall1_1/verify-preview-content.py']
        for p in policy_sources:read(p)
        report['emptyJPEGTailPolicy']=[bind(p)for p in policy_sources]
        failed=ROOT/'docs/quake/textures/codec-transition-actual-review-public-failed-v1.json'
        if failed.is_file():report['retainedStricterFailure']={
            'report':bind(failed),'log':bind(failed.with_suffix('.log')),
            'source':bind(failed.with_name('codec-transition-actual-review-public-failed-v1-source.py')),
            'finding':'Whole-JPEG identity can vary in the documented unpainted JPEG tail. Later probes reproduced it without any source/review rewrite; no concurrent-writer finding is made.'}
        need(actual['verdict'].startswith('PASS')and actual['counts']['newFiles']==50,'Actual codec proof absent')
        need(tuple(x['name']for x in batch['items'])==NAMES,'Wrong actual material scope')
        policy={r:({'lossless':False,'quality':92,'method':6}if r=='diffuse'else{'lossless':True,'compressionEffort':92,'method':6})for r in ROLES}
        need(batch['schemaVersion']==3 and batch['family']=='quake'and batch['pathsBase']=='repository'
             and batch['defaultTier']=='Mid'and batch['tierFactors']=={'Mid':4,'High':8}
             and batch['encodingByRole']==policy and 'lossless'not in batch and'quality'not in batch,'Contradictory review policy')
        held={x['texture']:x['artVerdict']for x in art['textures']}
        need(held=={n:'HOLD'for n in NAMES[2:]},'Three retained art HOLDs differ');report['artHolds']={'proof':bind(ART),'materials':held,'changed':False}
        codec={x['name']:x for x in actual['items']};expected_files={'index.html'};canvases_by_file={}
        root_files={p.name for p in REVIEW.iterdir()if p.is_file()}
        need(len(root_files)==21 and'index.html'in root_files,'Review completion file set absent')
        report['rootReviewPreHashes']=[bind(REVIEW/name)for name in sorted(root_files)]
        for name in sorted(root_files):read(REVIEW/name)
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
                    comparison=compare_jpeg(payload,expected,canvas,kind,min(maps['diffuse'].width,512))
                    report['emptyJPEGTailAllowanceUsed']|=not comparison['wholeJPEGBytesExact']
                    sheets.append({**bind(p),'dimensions':list(canvas.size),'independentPanelCanvas':comparison})
                    canvases_by_file[filename]=(canvas,kind,min(maps['diffuse'].width,512))
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
            replay_files=[]
            for filename in sorted(expected_files):
                replay,delivered=(output/filename).read_bytes(),read(REVIEW/filename)
                if filename=='index.html':
                    need(replay==delivered,'Whole public HTML replay differs')
                    replay_files.append({'file':filename,'wholeBytesExact':True});continue
                canvas,kind,side=canvases_by_file[filename]
                comparison=compare_jpeg(delivered,replay,canvas,kind,side)
                report['emptyJPEGTailAllowanceUsed']|=not comparison['wholeJPEGBytesExact']
                replay_files.append({'file':filename,'deliveredSha256':sha(delivered),'replaySha256':sha(replay),**comparison})
            report['publicCLIReplay']['files']=replay_files
            report['counts']['publicCLIReplayFiles']=len(expected_files)
        for p,digest in watched.items():need(sha(p.read_bytes())==digest,'Source/review changed during verification')
        report['rootReviewPostHashes']=[bind(REVIEW/name)for name in sorted(root_files)]
        need(report['rootReviewPreHashes']==report['rootReviewPostHashes'],'Root review file hashes changed')
        report['watchedInputs']={'files':len(watched),'allByteHashesUnchanged':True}
        report['verdict']='PASS bounded actual schema3 review bindings and exact material/label pixels; documented empty JPEG-tail limits retained; ART HOLDs unchanged'
    except Exception as error:
        report['verdict']='HOLD actual review verification failed';report['failure']={'type':type(error).__name__,'message':str(error)};traceback.print_exc()
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with args.report.open('x')as f:f.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'verdict':report['verdict'],'counts':report['counts'],'report':str(args.report)}));return 0 if report['verdict'].startswith('PASS')else 1


if __name__=='__main__':raise SystemExit(main())
