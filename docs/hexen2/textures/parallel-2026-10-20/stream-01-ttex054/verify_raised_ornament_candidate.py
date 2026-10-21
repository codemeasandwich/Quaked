#!/usr/bin/env python3
"""Read/replay actual ttex054 public outputs; never authors a new asset.

Use the independent public-test colour/float/UV-normal/codec oracles, not
producer helpers. Write only owned review evidence. No catalog/runtime claims.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import numpy as np
from PIL import Image,ImageDraw

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
spec=importlib.util.spec_from_file_location('public_tier_oracles',ROOT/'tests/hexen2_texture_tiers_test.py')
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
BATCH=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
MASTER=BATCH/'masters/ttex054-raised-ornament-v1'
TIERS=BATCH/'tiers/ttex054-raised-ornament-v1'
REVIEW=BATCH/'review/ttex054-raised-ornament-v1'
DESCRIPTOR=HERE/'ttex054-raised-ornament-v1-batch.json'
OUT=HERE/'decoded-raised-ornament-v1-review'
ROLES=['diffuse','height','normalX','normalY','normalZ']
P={'P1':[47,376,86,416],'P2':[92,224,145,270],'P3':[307,135,353,177],'P4':[175,32,212,59]}


def stamp(p):return dict(file=str(p.relative_to(ROOT)),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size)


def image(a):return Image.fromarray(np.rint(np.clip(a,0,1)*255).astype('uint8')).convert('RGB')


def light(n,d):
    d=np.array(d,dtype=float);d/=np.linalg.norm(d)
    return image(np.clip(n@d,0,1))


def repeat_files(directory,name,im):
    w,h=im.size
    x=Image.new('RGB',(w*2,h));x.paste(im,(0,0));x.paste(im,(w,0));x.save(directory/(name+'-X-repeat-1to1.png'))
    y=Image.new('RGB',(w,h*2));y.paste(im,(0,0));y.paste(im,(0,h));y.save(directory/(name+'-Y-repeat-1to1.png'))
    p=min(128,w//2,h//2);corner=Image.new('RGB',(p*2,p*2))
    for xx,yy,box in [(0,0,(w-p,h-p,w,h)),(p,0,(0,h-p,p,h)),(0,p,(w-p,0,w,p)),(p,p,(0,0,p,p))]:corner.paste(im.crop(box),(xx,yy))
    corner.save(directory/(name+'-corner-junction-1to1.png'))


def main():
    OUT.mkdir(exist_ok=False)
    manifest=json.loads((TIERS/'manifest.json').read_text());package=json.loads((MASTER/'master.json').read_text())
    original=BATCH/'originals/05-ttex054-cddf441f348f.png';native=Image.open(original).convert('RGB')
    rgb=Image.open(MASTER/'color.png').convert('RGB');height=np.load(MASTER/'height.npy')
    mask=np.asarray(Image.open(HERE/'canonical-raised-ornament-v1-review/canonical-gold-only-mask.png'))>0
    watched=[MASTER/'master.json',MASTER/'color.png',MASTER/'height.npy',TIERS/'manifest.json',original,DESCRIPTOR,
        ROOT/'tools/texture_sheets/derive_texture_tiers.py',ROOT/'tools/craft_normals.py',ROOT/'tests/hexen2_texture_tiers_test.py',
        ROOT/'tools/texture_sheets/build_texture_batch_review.py',Path(__file__).resolve()]
    for row in manifest['tiers'].values():watched += [TIERS/meta['file'] for meta in row['outputs'].values()]
    watched += [p for p in sorted(REVIEW.glob('*')) if p.is_file()]
    before=[stamp(p) for p in watched]
    assert manifest['Low']['sha256']==hashlib.sha256(original.read_bytes()).hexdigest()
    assert manifest['strength']==.3 and manifest['cap']==.5
    all_replay=[];decoded_rows=[]
    for name,row in manifest['tiers'].items():
        tierdir=OUT/name.lower();tierdir.mkdir()
        size=tuple(row['dimensions']);factor=row['factor']
        expected_rgb=oracle.periodic_rgb(rgb,size);expected_h=oracle.float_box(height,size)
        expected_n=oracle.cyclic_normals(expected_h,.3,.5)
        normal8=np.round(np.clip(expected_n*.5+.5,0,1)*255).astype('uint8')
        expected={'diffuse':expected_rgb,'height':Image.fromarray(np.round(expected_h*255).astype('uint8'))}
        expected.update({role:Image.fromarray(normal8[:,:,i]) for i,role in enumerate(ROLES[2:])})
        decoded={}
        for role in ROLES:
            meta=row['outputs'][role];f=TIERS/meta['file'];data=f.read_bytes()
            assert meta['quality']==92 and meta['method']==6 and meta['lossless'] is False
            oracle.vp8_only(data)
            assert data==oracle.q92(expected[role]),'Independent map replay differs: '+name+' '+role
            assert hashlib.sha256(data).hexdigest()==meta['sha256']
            decoded[role]=Image.open(f).convert('RGB');assert decoded[role].size==size
            all_replay.append(dict(tier=name,role=role,file=str(f.relative_to(ROOT)),sha256=meta['sha256'],exactPublicOracleQ92Replay=True,lossyVP8=True))
        dh=np.asarray(decoded['height'],dtype=float)[:,:,0]/255
        vector=np.stack([np.asarray(decoded['normal'+c],dtype=float)[:,:,0] for c in 'XYZ'],axis=2)/127.5-1
        vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
        height_normals=oracle.cyclic_normals(dh,.3,.5)
        decoded['diffuse'].save(tierdir/'diffuse-decoded-1to1.png');decoded['height'].save(tierdir/'height-decoded-1to1.png')
        image((dh-.965)/.04).save(tierdir/'height-decoded-FIXED-display.png')
        image(vector*.5+.5).save(tierdir/'XYZ-decoded-vector-1to1.png')
        for side,d in [('A',[.65,-.4,.6]),('B',[-.65,.4,.6])]:
            im=light(vector,d);im.save(tierdir/f'XYZ-neutral-light{side}-1to1.png')
            him=light(height_normals,d);him.save(tierdir/f'height-derived-neutral-light{side}-1to1.png')
            if side=='A':repeat_files(tierdir,'XYZ-neutral-lightA',im)
        repeat_files(tierdir,'diffuse',decoded['diffuse'])
        repeat_files(tierdir,'height-fixed-display',image((dh-.965)/.04))
        #Native and decoded colour are both BOX reduced to the exact same
        #native/2 and native/4 sizes, then enlarged only for labelled display.
        contact=Image.new('RGB',(800,650),'#202020');draw=ImageDraw.Draw(contact)
        checks=[]
        for i,divisor in enumerate([2,4]):
            dims=(native.width//divisor,native.height//divisor);a=native.resize(dims,Image.Resampling.BOX);b=decoded['diffuse'].resize(dims,Image.Resampling.BOX)
            err=np.abs(np.asarray(a,dtype=float)-np.asarray(b,dtype=float));checks.append(dict(divisor=divisor,dimensions=list(dims),MAE=float(err.mean()),maximum=float(err.max())))
            draw.text((5,i*325+5),f'{name} native/{divisor}; original / decoded; BOTH BOX',fill='white')
            contact.paste(a.resize((dims[0]*5,dims[1]*5),Image.Resampling.NEAREST),(5,i*325+25));contact.paste(b.resize((dims[0]*5,dims[1]*5),Image.Resampling.NEAREST),(180,i*325+25))
        contact.save(tierdir/'half-quarter-colour-BOX.png')
        sm=np.asarray(Image.fromarray(mask.astype('float32')).resize(size,Image.Resampling.BOX))
        gold=sm>.99;base=sm<.01
        patches=[]
        for label,box in P.items():
            x0,y0,x1,y1=[int(v*factor/8) for v in box];a=expected_h[y0:y1,x0:x1];b=dh[y0:y1,x0:x1]
            patches.append(dict(label=label,box=[x0,y0,x1,y1],uncompressedHeightStd=float(a.std()),decodedHeightStd=float(b.std()),decodedHeightUniqueSamples=int(np.unique(b).size),
                authoredNormalXYStd=float(expected_n[y0:y1,x0:x1,:2].std()),decodedNormalXYStd=float(vector[y0:y1,x0:x1,:2].std())))
        decoded_rows.append(dict(tier=name,dimensions=list(size),codecSettings=dict(quality=92,method=6,lossless=False),
            decodedHeightRange=[float(dh.min()),float(dh.max())],decodedHeightUniqueSamples=int(np.unique(dh).size),
            uncompressedGoldVsBaseMedianSeparation=float(np.median(expected_h[gold])-np.median(expected_h[base])),
            decodedGoldVsBaseMedianSeparation=float(np.median(dh[gold])-np.median(dh[base])),
            heightMAE=float(np.mean(np.abs(dh-expected_h))),
            maximumNormalAngleErrorDegrees=float(np.degrees(np.arccos(np.clip(np.sum(expected_n*vector,axis=2),-1,1))).max()),
            physicalPatchQuantization=patches,distanceChecks=checks,
            limitation='Pixel/codec/math checks do not establish ART. Tiny substrate height variation can be quantized away; inspect XYZ and actual repeat/lighting separately.'))
    #Actually replay standard public review CLI into a new temporary location,
    #then compare all delivered panel bytes. No review-helper function imported.
    with tempfile.TemporaryDirectory(prefix='ttex054-public-review-replay-') as tmp:
        destination=Path(tmp)/'review'
        args=[sys.executable,str(ROOT/'tools/texture_sheets/build_texture_batch_review.py'),'--batch',str(DESCRIPTOR),'--paths-root',str(ROOT),'--output',str(destination)]
        result=subprocess.run(args,capture_output=True,text=True,timeout=60)
        assert result.returncode==0,result.stderr
        review_rows=[]
        for f in sorted(REVIEW.glob('*')):
            if not f.is_file():continue
            other=destination/f.name;assert other.read_bytes()==f.read_bytes(),'Review panel replay differs: '+f.name
            review_rows.append(dict(file=str(f.relative_to(ROOT)),sha256=hashlib.sha256(f.read_bytes()).hexdigest(),actualCliPanelReplayExact=True))
    after=[stamp(p) for p in watched];assert before==after
    report=dict(schemaVersion=1,verdict='PASS independent public codec/UV-normal/direct-reduction/review-panel replay; final decoded ART remains separate',
        inputsBefore=before,inputsAfter=after,inputsStable=True,maps=all_replay,tiers=decoded_rows,publicReviewPanels=review_rows,
        limitations='Owner-directed shallow raised plaster approximation. Weak fine scalar wear and residual colour-related microheight are explicit; much weak height detail may be lost after codec. No runtime/owner/final independent ART acceptance or catalog registration.',
        nextAction='Actually inspect decoded both-tier colour/height/XYZ/neutral lights, X/Y/corners and BOX half/quarter, then freeze and report candidate to root for independent final public/art qualification.')
    (OUT/'public-replay-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(dict(verdict=report['verdict'],exactMaps=len(all_replay),exactReviewPanels=len(review_rows),tiers=decoded_rows)))


if __name__=='__main__':main()
