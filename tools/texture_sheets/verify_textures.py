"""Check the replacements in newer/textures against the original textures they replace:
prints those that look more like some other texture (a wrong name), best first.
Smooth noisy textures (rust, dark metal) are unreliable here: look at them by eye.
Needs wall-sheets/ (from make_sheets.py)."""
import sys,glob,os,json
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageFilter
from _match_orig import orig
def lum(im,s=32):
    g=im.convert('L').resize((s,s),Image.BOX).filter(ImageFilter.GaussianBlur(1))
    a=np.asarray(g,dtype=np.float32).ravel(); return a-a.mean()
def col(im): return np.asarray(im.convert('RGB').resize((4,4),Image.BOX),dtype=np.float32).ravel()
feats={n:(lum(o),col(o)) for n,o in orig.items()}
def rank(im,size):
    l=lum(im); c=col(im); sc=[]
    for k,(lk,ck) in feats.items():
        if orig[k].size!=size: continue
        ncc=float((l*lk).sum()/np.sqrt((l*l).sum()*(lk*lk).sum()+1e-9)); cd=float(np.abs(c-ck).mean())
        sc.append((ncc-cd/200,k))
    sc.sort(reverse=True); return sc
if __name__=='__main__':
    idx=json.load(open('/home/user/repo/newer/textures/index.json'))['textures']
    for n,fn in idx.items():
        im=Image.open('/home/user/repo/newer/textures/'+fn).convert('RGB')
        r=rank(im,orig[n].size)
        print('OK ' if r[0][1]==n else 'BAD',n,[(round(s,2),k) for s,k in r[:2]], 'rank',[k for _,k in r].index(n)+1)
