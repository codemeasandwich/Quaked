"""Frozen rtex054 direct10map/decoded-witness/publicCLI/preview proof; ART separate."""
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import datetime
from html.parser import HTMLParser

import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[6];D=Path(__file__).resolve().parent;S=D.parent
B=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-17-rtex054'
OUT=D/'verified-v1'
PARTIAL_SHA='378463ec278b83d7a7448b3eb1e4fcb411d750ed9468bca1085ef71c927f7e4c'
import hashlib
sha=lambda data:hashlib.sha256(data).hexdigest()
partial_path=D/'source-master-partial-v1.json';assert sha(partial_path.read_bytes())==PARTIAL_SHA
partial_meta=json.loads(partial_path.read_bytes());file=D/'verify-source-master-v1.py'
assert sha(file.read_bytes())==partial_meta['verifier']['sha256']
spec=importlib.util.spec_from_file_location('exact054_partial_helpers',file);helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
read,load,w=helper.read,helper.load,helper.w


def image(path):return Image.open(io.BytesIO(read(path))).convert('RGB')


def write(name,value):
    with(OUT/name).open('x') as file:json.dump(value,file,indent=2);file.write('\n')
    return w(OUT/name)


def existing_view(name,im):
    """Verify frozen author diagnostic pixels from fresh independent decoded maps.

    Reuse exact existing witness PNG rather than duplicate image bytes on disk.
    No author file is changed and no author verdict is used as acceptance.
    """
    path=S/'decoded-candidate-v1/decoded-art'/name
    buffer=io.BytesIO();im.save(buffer,'PNG');assert buffer.getvalue()==read(path),'Decoded witness differs: '+name
    return {**w(path),'independentlyReconstructedPNGBytesExact':True}


class Parser(HTMLParser):
    def __init__(self):super().__init__();self.images=[];self.scripts=[]
    def handle_starttag(self,tag,attrs):
        if tag=='img':self.images.append(dict(attrs))
        if tag=='script':self.scripts.append(dict(attrs))


def main():
    OUT.mkdir(exist_ok=False)
    report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Independent frozen054 source custody/directfloat10map/codec/actualpublicCLI/34previewpanels/decodedwitness proof; independent final ART separate','verdict':'HOLD'}
    temp=None
    try:
        handoff=load(S/'handoff.json');assert sha(read(S/'handoff.json')).startswith('307ccc87')
        freeze=load(S/'CANDIDATE_FREEZE.json');assert sha(read(S/'CANDIDATE_FREEZE.json'))=='6ae6eaecd3a8bd2906b79137769611d552cd0007e555b3b412491e2ab9147030'
        assert len(freeze['frozenInputs'])==187
        for path,digest in freeze['frozenInputs'].items():assert sha(read(path))==digest,path
        source=load(partial_path);assert source['verdict'].startswith('PASS') and source['currentInputsStable']
        for row in source['inputs']:assert sha(read(row['file']))==row['sha256']
        for path,digest in source['archiveInputsStable'].items():assert helper.archive_digest(path)==digest
        custody=load(D/'partial-custody-v1.json');assert sha(read(D/'partial-custody-v1.json'))=='32bd26984108df392c54923b2c6f38782d0375e9c6552b5b0955786868bcec5b'
        for row in source['materials']:
            assert row['masterPackage']['sha256']==handoff['currentMasterPackage']['sha256']
        batch=load(B/'batch.json');assert sha(read(B/'batch.json'))=='a4f45366001996b6404fa2bfdd23b275d44ed38d5d3fbb64b854c5b512edff32'
        item,=batch['items'];assert batch['schemaVersion']==2 and batch['defaultTier']=='Mid' and batch['tierFactors']=={'Mid':4,'High':8}
        assert (batch['quality'],batch['method'],batch['lossless'])==(92,6,False)
        identity=item['nativeIdentity']['id'];assert identity==handoff['nativeIdentity']=='d007ea021eb38aceb69f2236c61cae889628abe4d1abc49beffd18c529bbee27'
        mp=ROOT/item['masterPackage'];tp=ROOT/item['tierReceipt'];m=load(mp);tiers=load(tp)
        assert sha(read(mp))==item['masterPackageSha256']=='5eead8ad9bd8fbd84b45a5905cba9b36fbd4de00371761b8c16e82389d5869b4'
        assert sha(read(tp))==item['tierReceiptSha256']=='4f95aea7a8aa31383ca4ca07c297e5eca83d2f73e8c3433315293680ea71f1cb'
        assert (tiers['strength'],tiers['cap'])==(.3,.5)
        original=image(item['original']);rgb=image(mp.parent/'color.png');scalar=np.load(io.BytesIO(read(mp.parent/'height.npy')),allow_pickle=False)
        assert original.size==(64,64) and rgb.size==(512,512) and scalar.dtype==np.float32 and scalar.shape==(512,512)
        assert sha(read(mp.parent/'height.npy'))=='08d26484861cb80836bbacb6ecfef7b0e82e7c27c4f6c979673686f08b12385b'
        assert m['height']['authoringPolicy']=='rounded-caps-v1'
        journal,=load(B/'selection.json')['items'];assert journal['generationCount']==item['generationCount']==m['generationCount']==1
        assert journal['generationState']=='generated-retained' and read(journal['generated'])==read(journal['builtInOutput'])
        for role in ('original','generated','prompt'):
            assert item[role]==journal[role] and item[role+'Sha256']==journal[role+'Sha256']==m['inputs'][role]['sha256']
        oracle={'np':np,'Image':Image,'io':io}
        helper.functions(ROOT/'tests/hexen2_texture_tiers_test.py',{'q92','periodic_rgb','float_box','cyclic_normals','vp8_only'},oracle)
        reports=[];views=[];roles=('diffuse','height','normalX','normalY','normalZ')
        recipe=load(m['inputs']['roundedCapsRecipe']['file']);assert recipe==m['roundedCaps']['recipe']
        for name,factor in [('Mid',4),('High',8)]:
            n=64*factor;record=tiers['tiers'][name];height=oracle['float_box'](scalar,(n,n));normal=oracle['cyclic_normals'](height,tiers['strength'],tiers['cap'])
            packed=np.rint(np.clip(normal*.5+.5,0,1)*255).astype('uint8')
            images={'diffuse':oracle['periodic_rgb'](rgb,(n,n)),'height':Image.fromarray(np.rint(height*255).astype('uint8'))}
            images.update({role:Image.fromarray(packed[:,:,i]) for i,role in enumerate(roles[2:])})
            decoded={};maps=[]
            for role,im in images.items():
                row=record['outputs'][role];path=tp.parent/row['file'];data=read(path)
                assert data==oracle['q92'](im) and sha(data)==row['sha256'],name+' '+role
                assert (row['quality'],row['method'],row['lossless'])==(92,6,False)
                oracle['vp8_only'](data);decoded[role]=image(path);assert decoded[role].size==(n,n)
                assert str(path.relative_to(ROOT))==item['tiers'][name]['files'][role]
                maps.append({'role':role,**w(path),'exactDirectMasterQ92Method6Bytes':True})
            colors=np.asarray(decoded['diffuse']);dh=np.asarray(decoded['height'],float)[:,:,0]/255
            vec=np.stack([np.asarray(decoded[role],float)[:,:,0] for role in roles[2:]],2)/127.5-1
            vec/=np.maximum(np.linalg.norm(vec,axis=2,keepdims=True),1e-12)
            xyz=np.rint(np.clip((vec*.5+.5)*255,0,255)).astype('uint8');neutral=Image.new('RGB',(n*2,n));textured=Image.new('RGB',(n*2,n));lights=[]
            for index,sign in enumerate((1,-1)):
                direction=np.array([sign*.6,sign*.3,.75]);direction/=np.linalg.norm(direction)
                gain=.35+.65*np.maximum(0,np.einsum('ijk,k->ij',vec,direction))
                pixels=np.repeat(np.rint(gain*180).astype('uint8')[:,:,None],3,2);lights.append(pixels)
                neutral.paste(Image.fromarray(pixels),(index*n,0));textured.paste(Image.fromarray(np.rint(np.clip(colors*gain[:,:,None],0,255)).astype('uint8')),(index*n,0))
            prefix=name.lower();span=n//8
            witnesses={'diffuse':decoded['diffuse'],'height':decoded['height'],'XYZ':Image.fromarray(xyz),'neutral-opposed':neutral,'textured-opposed':textured,
              'repeat':Image.fromarray(np.tile(colors,(2,2,1))),'X-full':Image.fromarray(np.concatenate((colors[:,-span:],colors[:,:span]),1)),
              'Y-full':Image.fromarray(np.concatenate((colors[-span:],colors[:span]),0)),
              'corner':Image.fromarray(np.roll(np.roll(colors,span,0),span,1)[:span*2,:span*2])}
            distances=[]
            for divisor in (2,4):
                dims=(64//divisor,64//divisor);a=original.resize(dims,Image.Resampling.BOX);b=decoded['diffuse'].resize(dims,Image.Resampling.BOX)
                err=np.abs(np.asarray(a,float)-np.asarray(b,float));entry={'divisor':divisor,'dimensions':list(dims),'meanAbsoluteError':float(err.mean()),'maximum':float(err.max())}
                assert entry in record['distanceChecks'];distances.append(entry)
                panel=Image.new('RGB',(dims[0]*2,dims[1]));panel.paste(a,(0,0));panel.paste(b,(dims[0],0));witnesses['BOX'+str(dims[0])]=panel
            yy,xx=np.mgrid[:n,:n].astype(float);xx=(xx+.5)/factor;yy=(yy+.5)/factor
            contact=Image.new('RGB',(1280,1096),(25,27,30));draw=ImageDraw.Draw(contact);heads=[]
            for index,head in enumerate(recipe['caps']['heads']):
                cx,cy=head['centre'];rx,ry=head['radii'];rho=np.sqrt(((xx-cx)/rx)**2+((yy-cy)/ry)**2);samples=[]
                for lo,hi in ((0,.15),(.25,.4),(.55,.7),(.8,.95),(1.1,1.35)):
                    mask=(rho>=lo)&(rho<hi);values=dh[mask];assert values.size
                    samples.append({'normalizedRadius':[lo,hi],'pixels':int(mask.sum()),'mean':float(values.mean()),'median':float(np.median(values)),'range':[float(values.min()),float(values.max())]})
                assert samples[0]['mean']>samples[2]['mean']>samples[-1]['mean']
                heads.append({'label':head['label'],'decodedBroadHeightProfiles':samples,'broadCentreShoulderPlatePass':True,'limit':'Broad relative geometry, not pure material masks or every-point radial monotonicity.'})
                px=index%4*320;py=index//4*548;draw.text((px+3,py+3),name+' '+head['label']+' decoded RGB / XYZ',fill='white');draw.text((px+3,py+281),'Actual decoded neutral A / B; nearest display',fill='white')
                ix,iy=round(cx*factor-.5),round(cy*factor-.5);radius=max(18,round(38*factor/8));box=(max(0,ix-radius),max(0,iy-radius),min(n,ix+radius),min(n,iy+radius))
                for k,array in enumerate((colors,xyz,lights[0],lights[1])):contact.paste(Image.fromarray(array).crop(box).resize((152,152),Image.Resampling.NEAREST),(px+k%2*160,py+28+k//2*280))
            witnesses['all-eight-heads']=contact
            views.extend(existing_view(prefix+'-'+key+'.png',im) for key,im in witnesses.items())
            reports.append({'tier':name,'dimensions':[n,n],'maps':maps,'allFiveDirectFloatNormalAndCodecBytesExact':True,'distanceChecks':distances,'allEightDecodedBroadProfiles':heads,
              'normalDiagnostics':{key:value for key,value in record.items() if key.endswith('Degrees') or key=='heightQuantizationCompressionMAE'}})
        html=B/'review/index.html';parser=Parser();htmlbytes=read(html);parser.feed(htmlbytes.decode())
        assert not parser.scripts and len(parser.images)==4 and {r['src'] for r in parser.images}=={f'rtex054-{t}-{r}.jpg' for t in ('mid','high') for r in ('review','relief')}
        assert b'Mid (default) [256, 256]' in htmlbytes and b'High [512, 512]' in htmlbytes
        commands=[];previews=[]
        with tempfile.TemporaryDirectory(prefix='quaked-rtex054-final-map-review-',dir='/private/tmp') as td:
            temp=Path(td)
            def run(arguments):
                argv=['/usr/bin/python3',*map(str,arguments)];p=subprocess.run(argv,cwd=ROOT,env=dict(os.environ,PYTHONDONTWRITEBYTECODE='1'),capture_output=True,text=True,timeout=120)
                commands.append({'command':argv,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert p.returncode==0,p.stderr
            run([ROOT/'tools/texture_sheets/derive_texture_tiers.py','--original',ROOT/item['original'],'--master',mp.parent/'color.png','--height-master',mp.parent/'height.npy','--output',temp/'tiers'])
            for row in tiers['tiers'].values():
                for output in row['outputs'].values():assert (temp/'tiers'/output['file']).read_bytes()==read(tp.parent/output['file'])
            assert (temp/'tiers/manifest.json').read_bytes()==read(tp)
            run([ROOT/'tools/texture_sheets/build_texture_batch_review.py','--batch',B/'batch.json','--paths-root',ROOT,'--output',temp/'review'])
            assert (temp/'review/index.html').read_bytes()==htmlbytes
            for name in ('mid-review','mid-relief','high-review','high-relief'):
                path=B/'review'/('rtex054-'+name+'.jpg');replayed=temp/'review'/path.name;a=np.asarray(image(path));b=np.asarray(Image.open(replayed).convert('RGB'));assert a.shape==b.shape
                if name.endswith('review'):
                    boxes={'title':[0,0,1400,32],'native':[12,32,524,544],'diffuse':[540,32,1052,544],'detail':[1068,32,1324,288],'repeat':[12,570,524,1082],'half-label':[540,570,1400,595],'half-native':[540,595,636,691],'half-enhanced':[646,595,742,691],'quarter-label':[540,805,1400,830],'quarter-native':[540,830,588,878],'quarter-enhanced':[598,830,646,878]}
                else:
                    n=256 if name.startswith('mid') else 512;boxes={'top-labels':[0,0,1200,30],'bottom-labels':[0,550,1200,580],'height':[10,30,10+n,30+n],'XYZ':[610,30,610+n,30+n],'light-A':[10,580,10+n,580+n],'light-B':[610,580,610+n,580+n]}
                occupied=np.zeros(a.shape[:2],bool);panels=[]
                for label,(x0,y0,x1,y1) in boxes.items():
                    assert not occupied[y0:y1,x0:x1].any();assert np.array_equal(a[y0:y1,x0:x1],b[y0:y1,x0:x1]),name+' '+label
                    occupied[y0:y1,x0:x1]=True;panels.append({'panel':label,'rectangle':[x0,y0,x1,y1],'decodedRGBSHA256':sha(a[y0:y1,x0:x1].tobytes()),'exactReplay':True})
                changed=np.any(a!=b,2);tail=np.zeros_like(changed);tail[-16:,-40:]=True
                assert not np.any(tail&occupied) and not np.any(changed&~tail)
                previews.append({**w(path),'fullJPEGBytesExact':read(path)==replayed.read_bytes(),'changedPixels':int(changed.sum()),'panels':panels,'allChangesOnlyProvenUnused40x16Tail':True})
        assert not temp.exists();assert sum(len(p['panels']) for p in previews)==34 and len(views)==24
        assert all(sha(path.read_bytes())==digest for path,digest in helper.watched.items())
        assert all(helper.archive_digest(path)==digest for path,digest in source['archiveInputsStable'].items())
        preview=write('preview-v1.json',{'schemaVersion':1,'verdict':'PASS actual public reviewCLI HTML and34decoded content/label panels; JPEGpadding variance separately recorded','HTML':w(html),'HTMLBytesExact':True,'staticHTMLImageBindings':4,'scripts':0,'files':previews,'all4JPEGBytesExact':all(p['fullJPEGBytesExact'] for p in previews),'publicCLI':commands[-1],'browserClaim':'No live browser rendering or interaction observed or claimed.'})
        report.update({'verdict':'PASS independent frozen source-custody/direct10map float-normal-codec/publicCLI/HTML34panel and24decodedwitness reconstruction; final ART separate',
          'materials':[{'nativeIdentity':identity,'name':'rtex054','edition':'base','masterPackage':w(mp),'tierReceipt':w(tp),'sourceRaw':w(item['generated']),'exactPrompt':w(item['prompt']),'tiers':reports}],
          'handoff':w(S/'handoff.json'),'freeze':w(S/'CANDIDATE_FREEZE.json'),'frozenInputCount':187,'all187FrozenInputsStable':True,
          'actualSourceRGBFloatPublicProof':w(partial_path),'sourceProofFreshCustody':'Actually executed independent RGB/fullfloat/paraboloid/current wrapper proof3784carried through freshly exact98read/file and archive custody; not claimed recomputed anew in this map run.',
          'rootPreTierPhysicalReview':handoff['rootPreTierPhysicalReview'],'batch':w(B/'batch.json'),'preview':preview,'decodedWitnesses':views,'all24FrozenDiagnosticPNGBytesReconstructedExact':True,
          'publicCLIReplay':commands,'allTenMapAndManifestBytesExact':True,'ownedPrivateReplaysRemoved':True,'privateReplay':str(temp),'inputsStable':True,'archiveInputsStable':source['archiveInputsStable'],
          'verifier':w(Path(__file__)),'newModelCalls':0,'candidateMutations':0,'productionMapOrSourceAuthoring':False,'limits':['Offline final technical proof only until separate actual decoded material/physical ART and final custody review.','Root pre-tier physical and author ART are not substituted for this reviewer actual final ART.','JPEGvariance is confined to proven unused tail; no tolerance applies to WebP maps or any content/label panel.','Reused frozen source-only proof/native19slot proof is fresh through exact byte custody, not a new service-call audit or native BSP parse.','No live browser/game/GPU/owner/Git/CI/release acceptance.']})
        report['inputs']=[w(path) for path in sorted(helper.watched)]
    except BaseException as error:
        report.update({'verdict':'HOLD final technical verification failure','error':repr(error),'privateReplayRemoved':temp is None or not temp.exists(),'privateReplay':str(temp) if temp else None})
        raise
    finally:
        report['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();write('actual-v1.json',report)
        print(json.dumps({'proof':str((OUT/'actual-v1.json').relative_to(ROOT)),'sha256':sha((OUT/'actual-v1.json').read_bytes()),'verdict':report['verdict']}))

if __name__=='__main__':main()
