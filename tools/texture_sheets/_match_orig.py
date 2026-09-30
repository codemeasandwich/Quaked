import json, glob, os, sys
import numpy as np
from PIL import Image
m=json.load(open('wall-sheets/manifest.json'))
orig={}
for n,t in m['textures'].items():
    sh=Image.open('wall-sheets/'+t['sheet']).convert('RGB').crop((t['x'],t['y'],t['x']+t['w'],t['y']+t['h']))
    orig[n]=sh
def feat(im,w,h,s=16):
    a=np.asarray(im.resize((s,s),Image.BOX),dtype=np.float32).ravel()
    return a
def best(im,cands):
    res=[]
    for n in cands:
        o=orig[n]
        # allow wrap-shift invariance? no: direct compare
        f1=feat(im,*o.size); f2=feat(o,*o.size)
        a=f1-f1.mean(); b=f2-f2.mean()
        ncc=float((a*b).sum()/np.sqrt((a*a).sum()*(b*b).sum()+1e-9))
        res.append((ncc,n))
    res.sort(reverse=True); return res[:3]
if False:
    rows=[]
    for f in sorted(glob.glob('/home/user/repo/newer/textures/*.webp')):
        n=os.path.basename(f)[:-5]
        n=n.replace('p_','+') if n.startswith('p_') else n
        im=Image.open(f).convert('RGB')
        if n not in orig: print('??',n); continue
        w,h=orig[n].size
        cands=[k for k,v in orig.items() if v.size==(w,h)]
        b=best(im,cands)
        ok=b[0][1]==n
        print(('OK ' if ok else 'BAD'),n,[(round(s,2),k) for s,k in b])
