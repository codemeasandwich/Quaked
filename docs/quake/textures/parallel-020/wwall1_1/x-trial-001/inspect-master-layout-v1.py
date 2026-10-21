"""Read-only wwall-specific master diagnostics; writes only labelled evidence.

Fixed witnesses were classified from native/raw/master RGB before this trial.
Statistics do not qualify material or turn a geometric X splice into a PASS.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[6]
WITNESSES = [
    ('upper centre joint A', (210,120), (258,120)),
    ('upper centre joint B', (310,175), (259,175)),
    ('middle Y course upper face', (200,215), (200,254)),
    ('middle Y course lower face', (285,290), (285,254)),
    ('lower quarter joint', (85,375), (130,375)),
    ('lower three-quarter joint', (350,385), (391,385)),
    ('upper X perimeter joint A', (24,120), (0,120)),
    ('upper X perimeter joint B', (488,175), (0,175)),
    ('outer Y course upper side', (200,30), (200,0)),
    ('outer Y course lower side', (285,480), (285,0)),
]


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--master',type=Path,required=True)
    p.add_argument('--label',required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=False)
    rgb=Image.open(a.master/'color.png').convert('RGB')
    h=np.load(a.master/'height.npy',allow_pickle=False)
    assert rgb.size==(512,512) and h.shape==(512,512) and h.dtype==np.float32
    assert np.isfinite(h).all() and h.min()>=0 and h.max()<=1
    spec=importlib.util.spec_from_file_location('independent_witness_normals',ROOT/'tests/hexen2_texture_tiers_test.py')
    oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
    n=oracle.cyclic_normals(h,.3,.5)
    colors=np.asarray(rgb,dtype=float)
    images=[('RGB',rgb),('float height',Image.fromarray(np.round(h*255).astype('uint8')).convert('RGB')),
            ('XYZ',Image.fromarray(np.round(np.clip(n*.5+.5,0,1)*255).astype('uint8')))]
    for label,d in [('light A',np.array([.6,.3,.75])),('light B',np.array([-.6,-.3,.75]))]:
        d/=np.linalg.norm(d)
        shade=.35+.65*np.clip((n*d).sum(2),0,1)
        images.append((label,Image.fromarray(np.uint8(np.clip(colors*shade[:,:,None],0,255)))))
    join=Image.new('RGB',(5*160,560),(28,30,33));draw=ImageDraw.Draw(join)
    for i,(label,im) in enumerate(images):
        v=np.asarray(im);strip=np.concatenate((v[:,-80:],v[:,:80]),1)
        join.paste(Image.fromarray(strip),(i*160,30));draw.text((i*160+4,8),label,fill='white')
    join.save(a.output/'x-join.png')
    repeat=Image.fromarray(np.tile(np.asarray(rgb),(2,2,1)));repeat.save(a.output/'rgb-repeat-1to1.png')
    Image.fromarray(np.roll(np.roll(np.asarray(rgb),256,0),256,1)).save(a.output/'rolled-corner.png')
    source=Image.open(ROOT/'assets/authoring/texture_sheets/sources/official-world-2026-10-17/native-wwall1_1.png').convert('RGB')
    box=Image.new('RGB',(512,288),(28,30,33));d=ImageDraw.Draw(box)
    for row,div in enumerate((2,4)):
        for col,(label,im) in enumerate((('native',source),('master',rgb))):
            sm=im.resize((64//div,64//div),Image.Resampling.BOX)
            box.paste(sm.resize((128,128),Image.Resampling.NEAREST),(col*256,row*120+20))
            d.text((col*256,row*120+2),label+' BOX native/'+str(div),fill='white')
    box.save(a.output/'box-comparison.png')
    def mean(point):
        x,y=point
        return float(h[np.ix_((np.arange(y-2,y+3)%512),(np.arange(x-2,x+3)%512))].mean())
    rows=[]
    for label,face,joint in WITNESSES:
        f,j=mean(face),mean(joint)
        rows.append({'name':label,'face':face,'joint':joint,'faceMean':f,'jointMean':j,'faceAboveJoint':f>j})
    report={'label':a.label,'coordinateSpace':'512x512 original orientation; wrapped5x5 neighborhoods',
        'source':{p.name:{'file':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in [a.master/'master.json',a.master/'color.png',a.master/'height.npy']},
        'witnesses':rows,'allSelectedFaceAboveJoint':all(x['faceAboveJoint']for x in rows),
        'height':{'minimum':float(h.min()),'maximum':float(h.max()),'mean':float(h.mean()),'finite':True},
        'scope':'Source-specific semantic sampling and diagnostics only; all new relief and material still require actual visual review. Lower X is a continuous face, not a joint; no fabricated lower-X witness is accepted.',
        'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    (a.output/'witnesses.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'output':str(a.output),'allSelectedFaceAboveJoint':report['allSelectedFaceAboveJoint']}))


if __name__=='__main__':main()
