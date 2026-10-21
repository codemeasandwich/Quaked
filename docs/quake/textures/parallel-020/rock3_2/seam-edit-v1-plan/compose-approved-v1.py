"""One bound rock seam-edit composite; no resizing, tuning, master or tier work."""
from pathlib import Path
import hashlib,json,datetime,io
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[6]
plan=Path(__file__).resolve().parent
recipe_path=plan/'recipe-proposal.json'
assert hashlib.sha256(recipe_path.read_bytes()).hexdigest()=='02aea5221eb4b086ea958d9851fd5a78555d29d173fb1356ab2b7817a26cf464'
r=json.loads(recipe_path.read_text());batch=root/r['outputProposal']['batch'];journal=batch/'selection.json';j=json.loads(journal.read_text());item=j['items'][0]
assert j['cumulativeKnownImagegenCallCount']==3 and j['historicalKnownImagegenCallCount']==2 and item['generationCount']==1 and item['generationState']=='generated-retained'
assert r['sourceDimensions']==[1254,1254] and r['supportPixelEdgesRolled']==[499,0,755,1254] and r['featherSourcePixels']==24
watched={recipe_path:recipe_path.read_bytes(),journal:journal.read_bytes(),Path(__file__).resolve():Path(__file__).resolve().read_bytes()}
def read_bound(row):
 p=(root/row['file']).resolve();p.relative_to(root);data=p.read_bytes();assert hashlib.sha256(data).hexdigest()==row['sha256'],p;watched[p]=data;return data
def image(data):
 with Image.open(io.BytesIO(data))as im:
  assert im.format=='PNG'and im.mode=='RGB'and im.size==(1254,1254)
  return np.asarray(im).copy()
parent=image(read_bound(r['parentSource']));rolled=image(read_bound(r['editTarget']));assert np.array_equal(rolled,np.roll(parent,627,axis=1))
for key in ['parentHold','parentJournal','nativeLayoutReference','prompt']:read_bound(r[key])
read_bound(j['rootApproval'])
edit_row={'file':item['generated'],'sha256':item['generatedSha256']};edit=image(read_bound(edit_row))
assert edit_row['sha256']=='d3a5dfa88ea08e1b51f02c9a4d4cd3a714bb8078242d0075299e6a9a17d63b15'
x=np.arange(1254,dtype=np.float64)+.5
def smooth(t):t=np.clip(t/24.,0,1);return t*t*(3-2*t)
alpha=smooth(x-499)*smooth(755-x)
assert np.isfinite(alpha).all() and alpha.min()==0 and alpha.max()==1
assert np.count_nonzero(alpha>0)==256 and np.count_nonzero(alpha==1)==208
composite=rolled.copy();a=alpha[499:755][None,:,None]
composite[:,499:755]=np.rint((1-a)*rolled[:,499:755].astype(np.float64)+a*edit[:,499:755].astype(np.float64)).astype('uint8')
assert np.array_equal(composite[:,:499],rolled[:,:499]) and np.array_equal(composite[:,755:],rolled[:,755:])
assert np.array_equal(composite[:,523:731],edit[:,523:731])
final=np.roll(composite,-627,axis=1);assert np.array_equal(final[:,128:1126],parent[:,128:1126])
assert np.array_equal(np.roll(final,627,axis=1),composite)
assert all(p.read_bytes()==data for p,data in watched.items())
out=batch/'source';assert not out.exists()and not out.is_symlink();out.mkdir()
color=out/'rock3_2-seam-composite-v1.png';Image.fromarray(final,'RGB').save(color,'PNG')
with Image.open(color)as im:assert im.mode=='RGB'and im.size==(1254,1254)and np.array_equal(np.asarray(im),final)
assert all(p.read_bytes()==data for p,data in watched.items())
def bound(p):return {'file':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
receipt={'schemaVersion':1,'authoredAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'role':'derived source composition, not raw generator output or canonical master','texture':'rock3_2','nativeIdentity':r['nativeIdentity'],'parentSource':r['parentSource'],'exactReturnedEdit':edit_row,'returnedBuiltInPath':item['builtInOutput'],'imagegenCallOrdinal':3,'cumulativeKnownImagegenCallCount':3,'recipe':bound(recipe_path),'rootApproval':j['rootApproval'],'producer':bound(Path(__file__).resolve()),'journal':bound(journal),'sourceDimensions':[1254,1254],'rollX':627,'inverseRollX':-627,'supportPixelEdgesRolled':[499,0,755,1254],'featherSourcePixels':24,'alphaFormula':r['alphaPolicy'],'outsideRolledRGBByteExact':True,'outsideOriginalMiddleColumns':[128,1126],'outsideOriginalRGBByteExact':True,'fullWeightCoreRolledColumns':[523,731],'fullWeightCoreEqualsReturnedEdit':True,'inverseRollExact':True,'changedSourcePixelCount':int(np.any(final!=parent,axis=2).sum()),'finalSource':bound(color),'inputHashesUnchangedAfterComposition':True,'noResamplingSharpeningNoiseOrExtraFinishing':True,'qualification':'Unqualified source-composite trial. Actual material, reconstructed X, blend transitions, intentional Y/corners, native BOX and independent array reconstruction required before any master.'}
(out/'composite-lineage.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'receipt':bound(out/'composite-lineage.json'),'source':receipt['finalSource'],'changedSourcePixelCount':receipt['changedSourcePixelCount'],'outsideOriginalRGBByteExact':True,'coreEqualsEdit':True}))
