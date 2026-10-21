"""Source-specific colour-assisted neutral role guide; no relief or producer output.

Thresholds belong only to this retained source and are tied to source-visible
warm mineral/cool snow patches. They guide contour review; physical topology
and height are not inferred from colour alone. Never call this a universal mask.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
import matplotlib
matplotlib.use('Agg')
from matplotlib import pyplot as plt
R=Path.cwd();D=Path(__file__).resolve().parent;M=R/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-12-ttex255/masters/ttex255-v1'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
c=np.asarray(Image.open(M/'color.png').convert('RGB'),dtype=float);g=json.loads((D/'rock-feature-guide-v1.json').read_text());old=Image.new('L',(1024,1024));draw=ImageDraw.Draw(old)
for r in g['regions']:draw.polygon([(x*8,y*8)for x,y in r['polygon']],fill=255)
old=np.asarray(old)>0;warm=c[:,:,0]-c[:,:,2];L=c.mean(2)
# Same-source1-master-pixel smoothing is only for material boundary tracing.
chrom=ndi.gaussian_filter(warm,1.,mode='nearest');lum=ndi.gaussian_filter(L,1.,mode='nearest')
envelope=ndi.binary_dilation(old,iterations=40)
mineral=(chrom>8)&envelope
neutral_dark=(lum<55)&(chrom>=-3)&old
mask=mineral|neutral_dark
# Close only subpixel-scale fissures. Preserve large white pockets for review.
padded=np.pad(mask,3,mode='edge');padded=ndi.binary_closing(padded,iterations=2);mask=padded[3:-3,3:-3]
lab,n=ndi.label(mask);sizes=np.bincount(lab.ravel());keep=np.where(sizes>=32)[0];keep=keep[keep!=0];mask=np.isin(lab,keep)
holes=ndi.binary_fill_holes(mask)&~mask;hl,hn=ndi.label(holes);hs=np.bincount(hl.ravel());tiny=np.isin(hl,np.where((hs<=32)&(np.arange(len(hs))!=0))[0]);mask|=tiny
holes=ndi.binary_fill_holes(mask)&~mask;hl,hn=ndi.label(holes)
uncertain=((chrom>=5)&(chrom<=8)&envelope)|((lum<75)&(chrom<5)&old&~mask)
clear_snow=(chrom<5)&(lum>=75)&~mask
for name,a in [('pale-specks-on-rock-body-v5',tiny&(lum>=100)),('rock-body-proposal-v5',mask),('mineral-colour-evidence-v5',mineral),('ground-snow-evidence-v5',clear_snow),('unresolved-contact-evidence-v5',uncertain),('enclosed-snow-pocket-evidence-v5',holes)]:Image.fromarray(a.astype('uint8')*255).save(D/f'{name}.png')
# Extract actual binary-role contours in master-pixel edge coordinates.
outer=ndi.binary_fill_holes(mask)
fig,ax=plt.subplots();cs=ax.contour(np.pad(outer.astype(float),1),levels=[.5]);paths=[q-np.array([1,1]) for q in cs.allsegs[0]];plt.close(fig)
def dp(p,tol):
 if len(p)<3:return p
 a,b=p[0],p[-1];v=b-a
 ds=np.linalg.norm(p-a,axis=1)if np.linalg.norm(v)<1e-12 else np.abs(np.cross(v,p-a))/np.linalg.norm(v)
 i=int(np.argmax(ds))
 if ds[i]<=tol:return np.array([a,b])
 return np.vstack((dp(p[:i+1],tol)[:-1],dp(p[i:],tol)))
regions=[]
for i,p in enumerate(paths):
 if np.linalg.norm(p[0]-p[-1])<1e-8:p=p[:-1]
 # Split closed contour at its furthest point before RDP simplification.
 k=int(np.argmax(np.linalg.norm(p-p[0],axis=1)));q=np.vstack((dp(p[:k+1],3.0)[:-1],dp(np.vstack((p[k:],p[:1])),3.0)[:-1]));q=np.clip(q+.5,0,1024)
 if len(q)<3:continue
 regions.append({'label':f'V5-R{i+1:02d}','polygon':(q/8).tolist(),'masterVertexCount':len(q),'status':'Source-assisted boundary proposal; physical caps/gaps unqualified'})
hr=[]
contact=Image.new('RGB',(1024,max(256,((hn+3)//4)*160)));dd=ImageDraw.Draw(contact)
for i in range(1,hn+1):
 yy,xx=np.where(hl==i);box=[int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)];area=len(xx);hr.append({'id':i,'areaMasterPixels':area,'boxMasterPixels':box,'physicalRole':'UNRESOLVED snow-cap-on-rock versus lower snow-filled gap; actual source review required'})
 x0,y0,x1,y1=box;pad=16;bb=[max(0,x0-pad),max(0,y0-pad),min(1024,x1+pad),min(1024,y1+pad)];im=Image.fromarray(c.astype('uint8')).crop(bb);im.thumbnail((240,128));x=((i-1)%4)*256;y=((i-1)//4)*160;contact.paste(im,(x,y+28));dd.text((x,y),f'Pocket{i} {box} area{area}',fill='white')
contact.save(D/'snow-pocket-source-contact-v5.png')
ov=Image.fromarray(c.astype('uint8')).convert('RGBA');paint=np.zeros((1024,1024,4),dtype='uint8');paint[mask]=[255,0,255,65];paint[holes]=[0,255,255,100];paint[uncertain]=[255,210,0,100];Image.alpha_composite(ov,Image.fromarray(paint)).convert('RGB').save(D/'source-role-guide-v5-overlay.png')
removed=old&~mask;added=mask&~old;diff=np.zeros((1024,1024,3),dtype='uint8');diff[removed]=[0,220,255];diff[added]=[255,90,0];Image.fromarray(diff).save(D/'v1-to-v5-role-change.png')
r={'schemaVersion':1,'status':'REFINED_SOURCE_ROLE_PROPOSAL_ONLY; NO_COMPOSE_HEIGHT_TIER','sourceRGB':{'file':str((M/'color.png').relative_to(R)),'sha256':sha(M/'color.png')},'referenceSize':[128,128],'regions':regions,'enclosedSnowPockets':hr,'actualSourceCriteria':{'warmMineral':'Gaussian1 master pixel R-B >8 inside40-master-pixel dilation of manually reviewed bodies','darkMineralShadowProposal':'Lmean<55 and R-B>=-3 inside original manually observed body; uncertain topology not inferred from brightness','morphology':'2-master-pixel closing with edge padding, retain components>=32pixels, fill only enclosed pockets<=32pixels as unresolved fine frost within rock footprint','calibrationScope':'This single retained source; warm rock versus cool snow is material colour evidence, never height measurement or a universal terrain rule.'},'coverage':{'v1Rock':float(old.mean()),'v5Rock':float(mask.mean()),'removedOvershootPixels':int(removed.sum()),'addedSourceVisibleMineralPixels':int(added.sum()),'uncertainContactPixels':int(uncertain.sum()),'enclosedPocketCount':hn},'actualRoleEdgeMismatch':{'X':float((mask[:,0]!=mask[:,-1]).mean()),'Y':float((mask[0]!=mask[-1]).mean())},'sourceEdgeEvidence':'No opposite edge role was forced equal; masks classify the actual two edges independently. Compare role disagreement with actual RGB warm/cool contacts before calling mask error versus source seam.','finePaleSpecks':'Tiny enclosed pale specks <=32master pixels remain on upper body as ambiguous frost/mineral detail, not invented lower holes. No broad snow cap with independently known elevation is claimed.', 'contourCoordinateConvention':'Matplotlib samples are pixel centres indexed0; add0.5 before clipping to pixel-edge coordinates0..1024. This does not equalize opposing source edges.','contourSimplificationMasterPixels':3.0,'maskIdentityNote':'Same source classification asv3, only contour representation tolerance changes from1.5to3 master pixels to test unchanged bounded polygon policy; no physical acceptance implied.', 'limits':['Contours and neutral roles are a review aid; snow caps/ground gaps remain unqualified.','Extracted outer footprints intentionally do not erase enclosed snow pockets; those are recorded separately for physical review before complementary lower polygons.','No source/RGB/height altered. Recipev1 remains unapproved and unchanged.']}
(D/'rock-feature-guide-v5.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'regions':len(regions),'maxVertices':max(x['masterVertexCount']for x in regions),'coverage':r['coverage'],'edge':r['actualRoleEdgeMismatch'],'guideSHA256':sha(D/'rock-feature-guide-v5.json')},indent=2))
