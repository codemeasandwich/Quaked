"""Independent docs-only proof of actual colour trials; no product writes."""
import hashlib,importlib.util,io,json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,features
import PIL
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[6]
OUT=Path(__file__).resolve().parent;TRIAL=OUT.parent
sha=lambda b:hashlib.sha256(b).hexdigest()
tool=ROOT/'tools/texture_sheets/finish_official_texture.py'
spec=importlib.util.spec_from_file_location('actual_finisher',tool);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
# Reconstruct field independently using Fourier convolution and per-channel wrapped bicubic interpolation.
def reconstruct(native,donor):
 h,w,_=native.shape
 target=native.reshape(h//2,2,w//2,2,3).mean(axis=(1,3))
 coarse=donor.reshape(h//2,8,w//2,8,3).mean(axis=(1,3))
 yy=np.fft.fftfreq(h//2)[:,None];xx=np.fft.fftfreq(w//2)[None,:]
 low=np.fft.ifft2(np.fft.fft2(target-coarse,axes=(0,1))*np.exp(-2*np.pi**2*1.5**2*(xx*xx+yy*yy))[:,:,None],axes=(0,1)).real
 fields=[]
 for c in range(3):
  im=Image.fromarray(np.tile(low[:,:,c],(3,3)).astype('float32'),'F').resize((w*12,h*12),Image.Resampling.BICUBIC)
  fields.append(np.asarray(im)[h*4:h*8,w*4:w*8])
 correction=np.stack(fields,axis=2)*.35
 raw=donor+correction
 return np.rint(np.clip(raw,0,255)).astype('uint8'),raw,correction
report={'scope':'Exact replay and offline ART evidence for three uninstalled legacy colour-only trials; not scene/runtime/owner/8x acceptance','tool':{'file':str(tool.relative_to(ROOT)),'sha256':sha(tool.read_bytes())},'environment':{'python':sys.version,'Pillow':PIL.__version__,'numpy':np.__version__,'webp':features.version('webp')},'materials':[]}
for n in ['tech08_1','tech09_3','tech10_1']:
 receipt=json.loads((TRIAL/(n+'-colour.json')).read_bytes());paths={k:ROOT/receipt[k] for k in ['original','generated','output']}
 for k in paths:assert sha(paths[k].read_bytes())==receipt[k+'Sha256']
 assert sha(tool.read_bytes())==receipt['toolSha256']
 images={k:Image.open(v).convert('RGB') for k,v in paths.items()};arrays={k:np.asarray(v,dtype=float) for k,v in images.items()}
 assert images['generated'].size==images['output'].size
 assert receipt['method']=='photographic' and receipt['verticalLandmarks'] is None and receipt['edgeAnchor'] is False
 assert receipt['colorStrength']==.35 and receipt['fieldSigma']==1.5 and receipt['factor']==4 and receipt['comparisonDivisor']==2
 actual,metrics=mod.finish(images['original'],images['generated'],factor=4,method='photographic',comparison_divisor=2,color_strength=.35,field_sigma=1.5,edge_anchor=False)
 encoded=io.BytesIO();actual.save(encoded,format='PNG')
 pixel,raw,correction=reconstruct(arrays['original'],arrays['generated'])
 assert np.array_equal(pixel,np.asarray(images['output']))
 assert actual.tobytes()==images['output'].tobytes()
 assert encoded.getvalue()==paths['output'].read_bytes()
 clipped=((raw<0)|(raw>255))&((arrays['generated']>0)&(arrays['generated']<255));anyclip=clipped.any(2)
 row={'name':n,'receiptSha256':sha((TRIAL/(n+'-colour.json')).read_bytes()),'native':{'file':receipt['original'],'sha256':receipt['originalSha256']},'source':{'file':receipt['generated'],'sha256':receipt['generatedSha256']},'candidate':{'file':receipt['output'],'sha256':receipt['outputSha256']},'publicFinishFullPngBytesExact':True,'independentMathAllPixelsExact':True,'dimensionsUnchanged':list(images['output'].size),'nativeBOX':{},'clipping':{'newClippedChannelFraction':float(clipped.mean()),'newClippedPixelFraction':float(anyclip.mean()),'channelCountsRgb':clipped.sum((0,1)).tolist(),'donorClippedValuesMeanRgb':arrays['generated'][anyclip].mean(0).tolist() if anyclip.any() else [],'donorLumaOver30ClippedPixels':int((anyclip&((arrays['generated']@np.array([.299,.587,.114]))>30)).sum()),'rawMinMax':[float(raw.min()),float(raw.max())],'correctionMinMax':[float(correction.min()),float(correction.max())]},'finisherMetrics':metrics}
 w,h=images['original'].size
 boxcanvas=Image.new('RGB',(768,230),(20,20,20));d=ImageDraw.Draw(boxcanvas)
 for j,q in enumerate([2,4]):
  size=(w//q,h//q);aa=arrays['original'].reshape(h//q,q,w//q,q,3).mean((1,3));bb=arrays['generated'].reshape(h//q,q*4,w//q,q*4,3).mean((1,3));cc=pixel.astype(float).reshape(h//q,q*4,w//q,q*4,3).mean((1,3))
  row['nativeBOX'][str(q)]={'dimensions':list(size),'donorMAE':float(np.abs(bb-aa).mean()),'candidateMAE':float(np.abs(cc-aa).mean()),'donorMeanRgb':bb.mean((0,1)).tolist(),'candidateMeanRgb':cc.mean((0,1)).tolist(),'nativeMeanRgb':aa.mean((0,1)).tolist()}
  for k,key in enumerate(['original','generated','output']):
   img=images[key].resize(size,Image.Resampling.BOX).resize((size[0]*2,size[1]*2),Image.Resampling.NEAREST);boxcanvas.paste(img,(k*256,j*115+20));d.text((k*256,j*115),key+' BOX /'+str(q),fill='white')
 boxcanvas.save(OUT/(n+'-BOX.png'))
 # Literal all pixels, no reduction: source | candidate | clipped-pixel map.
 W,H=images['output'].size;panel=Image.new('RGB',(W*3,H+20));d=ImageDraw.Draw(panel)
 for j,k in enumerate(['generated','output']):panel.paste(images[k],(j*W,20));d.text((j*W,0),k,fill='white')
 overlay=np.asarray(images['generated']).copy();overlay[anyclip]=[255,0,255];panel.paste(Image.fromarray(overlay),(W*2,20));d.text((W*2,0),'new channel clipping magenta',fill='white');panel.save(OUT/(n+'-literal-clipping.png'))
 report['materials'].append(row)
# Prove the product-state watches pinned before these trials still match.
protected=json.loads((TRIAL/'execution-reconciliation.json').read_bytes())['protectedCurrentHashes']
lineage=json.loads((TRIAL.parent/'screenshot-owner-source/lineage.json').read_bytes())
for r in lineage['materials']:
 if r['name']=='tech10_1':protected.extend([r['currentDiffuse'],r['currentHeight']])
report['protectedFiles']=[]
for r in protected:
 actual=sha((ROOT/r['file']).read_bytes());assert actual==r['sha256'];report['protectedFiles'].append({'file':r['file'],'sha256':actual,'unchangedFromPinnedEvidence':True})
(OUT/'replay.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'exact':len(report['materials']),'protected':len(report['protectedFiles']),'output':str(OUT/'replay.json')}))
