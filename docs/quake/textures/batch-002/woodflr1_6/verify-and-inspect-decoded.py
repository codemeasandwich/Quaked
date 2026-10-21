"""Bounded delivery evidence using existing independent math/encoder oracles.

Writes diagnostic views only. It does not author a source/master, move a failed
witness, qualify every perimeter sample as a groove, or replace root review.
"""
from pathlib import Path
import hashlib
import importlib.util
import io
import json
import math

import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[5]
HERE=Path(__file__).resolve().parent
BASE=ROOT/'assets/authoring/texture_sheets/sources/quake-world-2026-10-20/batch-002/woodflr1_6'
MASTER=BASE/'master-layered-v1'
TIERS=BASE/'tiers-layered-v1'
OUT=HERE/'decoded-layered-v1'
assert not OUT.exists()
OUT.mkdir()
sha=lambda data:hashlib.sha256(data).hexdigest()
receipt=json.loads((TIERS/'manifest.json').read_text())
scalar=np.load(MASTER/'height.npy',allow_pickle=False)
rgb=Image.open(MASTER/'color.png').convert('RGB')
native=Image.open(BASE/'source-v1/native.png').convert('RGB')
spec=importlib.util.spec_from_file_location('woodflr_existing_independent_oracle',ROOT/'tests/hexen2_texture_tiers_test.py')
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
regions=json.loads((HERE/'master-layered-v1-diagnostics/classification-before-depth.json').read_text())['regions']
report={'scope':'Actual10maps existing independent oracle replay/codecs and bounded decoded physical/art diagnostics; root independent final review remains',
 'master':{'file':str((MASTER/'master.json').relative_to(ROOT)),'sha256':sha((MASTER/'master.json').read_bytes())},
 'tiers':{},'all10MapsExactIndependentEncoderReplay':True,'initialFailedHeightRetained':True,
 'wrappedLimits':'Exact perimeter samples are material step/face edges, not all groove floors. Retain false belowBoth predicates and root review.',
 'rootInterfaceReview':'docs/quake/textures/batch-002/woodflr1_6/master-layered-v1-diagnostics/root-interface-review.json',
 'verifierSha256':sha(Path(__file__).read_bytes())}
decoded={}
for tier,factor in [('Mid',4),('High',8)]:
    row=receipt['tiers'][tier];size=(64*factor,64*factor)
    reduced=oracle.float_box(scalar,size)
    normal=oracle.cyclic_normals(reduced,receipt['strength'],receipt['cap'])
    packed=np.round(np.clip(normal*.5+.5,0,1)*255).astype('uint8')
    expected={'diffuse':oracle.periodic_rgb(rgb,size),'height':Image.fromarray(np.round(reduced*255).astype('uint8'))}
    expected.update({role:Image.fromarray(packed[:,:,i])for i,role in enumerate(['normalX','normalY','normalZ'])})
    maps={};public=[]
    for role,record in row['outputs'].items():
        path=TIERS/record['file'];data=path.read_bytes()
        assert sha(data)==record['sha256']
        stream=io.BytesIO();expected[role].save(stream,'WEBP',quality=92,lossless=role!='diffuse',method=6)
        assert stream.getvalue()==data
        image=Image.open(io.BytesIO(data)).convert('RGB');assert image.size==size;maps[role]=image
        if role!='diffuse':assert np.array_equal(np.asarray(image),np.asarray(expected[role].convert('RGB')))
        kinds=[];at=12
        assert data[:4]==b'RIFF' and data[8:12]==b'WEBP' and int.from_bytes(data[4:8],'little')+8==len(data)
        while at<len(data):
            kinds.append(data[at:at+4]);n=int.from_bytes(data[at+4:at+8],'little');at+=8+n+n%2
        assert at==len(data) and (b'VP8L'in kinds)==(role!='diffuse')and(b'VP8 'in kinds)==(role=='diffuse')
        public.append({'role':role,'file':str(path.relative_to(ROOT)),'sha256':sha(data),'exactIndependentEncoderReplay':True,'exactDecodedIntendedChannels':role!='diffuse'})
    decoded[tier]=maps['diffuse'];tag=tier.lower();pixels=np.asarray(maps['diffuse'])
    height=np.asarray(maps['height'],dtype=float)[:,:,0]/255
    vector=np.stack([np.asarray(maps['normal'+axis],dtype=float)[:,:,0]for axis in 'XYZ'],2)/127.5-1
    vector/=np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
    maps['diffuse'].save(OUT/(tag+'-diffuse.png'));maps['height'].save(OUT/(tag+'-height.png'))
    Image.fromarray(np.uint8(np.clip((height-.93)/.07*255,0,255))).save(OUT/(tag+'-height-display.png'))
    Image.fromarray(np.uint8(np.clip((vector*.5+.5)*255,0,255))).save(OUT/(tag+'-XYZ.png'))
    for label,direction in [('A',np.array([.6,.3,.75])),('B',np.array([-.6,-.3,.75]))]:
        direction/=np.linalg.norm(direction);light=.35+.65*np.clip((vector*direction).sum(2),0,1)
        Image.fromarray(np.uint8(np.clip(pixels*light[:,:,None],0,255))).save(OUT/(tag+'-light-'+label+'.png'))
        Image.fromarray(np.uint8(np.clip(light*255,0,255))).save(OUT/(tag+'-grey-light-'+label+'.png'))
    Image.fromarray(np.tile(pixels,(2,2,1))).save(OUT/(tag+'-repeat2x2.png'))
    Image.fromarray(np.roll(np.roll(pixels,size[0]//2,0),size[0]//2,1)).save(OUT/(tag+'-rolled-corner.png'))
    strip=32 if tier=='Mid' else 64
    Image.fromarray(np.concatenate((pixels[:,-strip:],pixels[:,:strip]),1)).save(OUT/(tag+'-X-join.png'))
    Image.fromarray(np.concatenate((pixels[-strip:],pixels[:strip]),0)).save(OUT/(tag+'-Y-join.png'))
    samples=[]
    for region in regions:
        sample={'name':region['name'],'masterRectangles':{k:region[k]for k in ['wood','stone','contact']},'tierRectangles':{}}
        for role in ['wood','stone','contact']:
            x0,y0,x1,y1=region[role]
            coords=[math.floor(x0*size[0]/512),math.floor(y0*size[1]/512),math.ceil(x1*size[0]/512),math.ceil(y1*size[1]/512)]
            xx0,yy0,xx1,yy1=coords;values=height[yy0:yy1,xx0:xx1]
            sample['tierRectangles'][role]=coords;sample[role+'Mean']=float(values.mean())
        sample['woodAboveStone']=sample['woodMean']>sample['stoneMean']
        sample['contactBelowBoth']=sample['contactMean']<min(sample['woodMean'],sample['stoneMean']);samples.append(sample)
    report['tiers'][tier]={'dimensions':list(size),'publicMapChecks':public,'witnesses':samples,
      'woodAboveStoneAllSix':all(x['woodAboveStone']for x in samples),
      'originalFourContactsBelowBoth':all(x['contactBelowBoth']for x in samples[:4]),
      'wrappedPredicatePreserved':[{'name':x['name'],'contactBelowBoth':x['contactBelowBoth']}for x in samples[4:]]}
board=Image.new('RGB',(576,340),(28,30,33));draw=ImageDraw.Draw(board)
for y,divisor in enumerate([2,4]):
    for x,(label,image)in enumerate([('native',native),('Mid256',decoded['Mid']),('High512',decoded['High'])]):
        small=image.resize((64//divisor,64//divisor),Image.Resampling.BOX)
        board.paste(small.resize((128,128),Image.Resampling.NEAREST),(x*192,y*160+20))
        draw.text((x*192+4,y*160+2),label+' BOXnative/'+str(divisor),fill='white')
board.save(OUT/'native-mid-high-box-both.png')
(OUT/'decoded-public-physical.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:{'dimensions':v['dimensions'],'woodAboveStoneAllSix':v['woodAboveStoneAllSix'],'originalFourContactsBelowBoth':v['originalFourContactsBelowBoth'],'wrappedPredicate':v['wrappedPredicatePreserved']}for k,v in report['tiers'].items()},indent=2))
