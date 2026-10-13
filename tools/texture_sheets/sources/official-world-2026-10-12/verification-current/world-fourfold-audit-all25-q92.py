import json,hashlib,re,io,collections
from pathlib import Path
from PIL import Image
ROOT=Path('/Users/bri/SOURCE/Quaked');BASE=ROOT/'newer/textures';OUT=Path('/private/tmp/quaked-texture-independent-review')
raw=(BASE/'index.json').read_bytes();index=json.loads(raw);inventory=json.loads((ROOT/'tools/texture_sheets/sources/official-world-2026-10-12/inventory-current.json').read_bytes());actual={(v['name'],v['key']):v for v in inventory['variants']}
records={};images={};references={};scalars={};selection_missing=[]
def picture(file):
 if file not in images:
  p=BASE/file
  try:
   b=p.read_bytes()
   with Image.open(io.BytesIO(b)) as im: im.load(); dimensions=list(im.size)
   images[file]={'dimensions':dimensions,'sha256':hashlib.sha256(b).hexdigest()}
  except Exception as e:images[file]={'error':str(e)}
 return images[file]
def select(name,key):
 glass=index.get('glass',{}).get(name)
 if glass is not None:
  v=glass.get(key)
  if not v:return None
  return ('glass',v['file'],{'file':v.get('heightFile'),'normalFile':v.get('normalFile'),'glossFile':v.get('glossFile'),'normalChannels':v.get('normalChannels'),'glossOpeningFile':v.get('glossOpeningFile')},v.get('nativeFile'))
 ordinary=index.get('ordinaryVariants',{}).get(name,{}).get(key)
 if ordinary:return ('ordinary-variant',ordinary['file'],ordinary.get('normal')or{},None)
 if name in index.get('sources',{}) and key not in index['sources'][name]:return None
 file=index['textures'].get(name)
 return ('ordinary',file,index.get('normals',{}).get(name)or{},None)if file else None
def bind(name,key,kind=None,parent=None):
 selection=select(name,key)
 if not selection:return
 match=re.match(r'^(\d+)x(\d+):',key)
 if not match:selection_missing.append({'name':name,'key':key,'reason':'No dimensions in native key'});return
 w,h=map(int,match.groups());route,file,normal,native=selection;identifier=(name,key)
 if identifier in records:return
 v=actual.get(identifier)
 rec={'name':name,'nativeKey':key,'nativeDimensions':[w,h],'targetDimensions':[w*4,h*4],'route':route,'file':file,'nativeAuthority':kind or('actual-inventory'if v else'catalogue-source-key-only'),'sourceGames':sorted(set(u['game']for u in v['uses']))if v else[],'companions':[]}
 if parent:rec['dynamicNativeParent']=parent
 rec['image']=picture(file);rec['matchesFourfold']=rec['image'].get('dimensions')==rec['targetDimensions']
 for field,role in [('file','height'),('normalFile','authored-normal'),('glossFile','gloss'),('glossOpeningFile','glass-opening')]:
  if normal.get(field):
   f=normal[field];im=picture(f);rec['companions'].append({'role':role,'file':f,**im,'matchesFourfold':im.get('dimensions')==rec['targetDimensions'],'matchesDiffuse':im.get('dimensions')==rec['image'].get('dimensions')})
 for axis,f in (normal.get('normalChannels')or{}).items():
  im=picture(f);rec['companions'].append({'role':'normal-'+axis,'file':f,**im,'matchesFourfold':im.get('dimensions')==rec['targetDimensions'],'matchesDiffuse':im.get('dimensions')==rec['image'].get('dimensions')})
 if native:
  im=picture(native);references[native]={'role':'native-glass-reference','dimensions':im.get('dimensions'),'expectedNative':[w,h],'notResizeCompanion':True}
 if normal.get('edgeSource'):
  f=normal['edgeSource']['file'];references[f]={'role':'normal-edge-source-reference','config':normal['edgeSource'],'dimensions':picture(f).get('dimensions'),'notResizeCompanion':True};rec['edgeSource']=references[f]
 if normal.get('dataFile'):
  f=normal['dataFile'];b=(BASE/f).read_bytes();scalars.setdefault(f,{'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'bindings':[]})['bindings'].append({'name':name,'nativeKey':key,'requiredFourfoldBytes':2*w*4*h*4,'currentDiffuseExpectedBytes':2*rec['image'].get('dimensions',[0,0])[0]*rec['image'].get('dimensions',[0,0])[1]});rec['scalarFile']=f
 records[identifier]=rec
for name,key in actual:bind(name,key)
for name,keys in index.get('sources',{}).items():
 for key in keys:bind(name,key)
for field in ['glass','ordinaryVariants']:
 for name,variants in index.get(field,{}).items():
  for key in variants:bind(name,key)
crate_parents=[v for v in inventory['variants']if re.match(r'^crate\d_side$',v['name'])]
for name in index['textures']:
 if name not in index.get('sources',{}) and name.startswith('crate_'):
  for v in crate_parents:bind(name,v['key'],'dynamic-crate-parent',v['name'])
groups={}
for rec in records.values():
 for file,role,im in [(rec['file'],'diffuse',rec['image'])]+[(c['file'],c['role'],c)for c in rec['companions']]:
  g=groups.setdefault(file,{'file':file,'roles':set(),'currentDimensions':im.get('dimensions'),'targets':collections.defaultdict(list),'sha256':im.get('sha256'),'error':im.get('error')})
  g['roles'].add(role);g['targets'][tuple(rec['targetDimensions'])].append({'name':rec['name'],'nativeKey':rec['nativeKey'],'route':rec['route'],'nativeAuthority':rec['nativeAuthority']})
for g in groups.values():
 g['roles']=sorted(g['roles']);g['conflictingTargetDimensions']=len(g['targets'])>1;g['targets']=[{'dimensions':list(t),'bindings':v,'matchesCurrent':list(t)==g['currentDimensions']}for t,v in g['targets'].items()];g['mismatch']=any(not x['matchesCurrent']for x in g['targets'])
rows=list(records.values());ordered=sorted(groups.values(),key=lambda g:g['file']);summary={'rule':'Every runtime diffuse and matching image companion must be exactly 4x native width and 4x native height','indexSha256':hashlib.sha256(raw).hexdigest(),'inventoryIndexSha256':inventory['indexSha256'],'inventoryBindingStatusesRecomputed':True,'bindings':len(rows),'byRoute':dict(collections.Counter(r['route']for r in rows)),'diffuseBindingsMismatching':sum(not r['matchesFourfold']for r in rows),'mismatchGroups':sum(g['mismatch']for g in ordered),'conflictingFileGroups':sum(g['conflictingTargetDimensions']for g in ordered),'runtimeFiles':len(ordered),'nativeReferenceFiles':len(references),'scalarFiles':len(scalars)}
report={'summary':summary,'fileGroups':ordered,'bindings':rows,'references':references,'scalars':scalars,'unresolved':selection_missing,'qualification':'Read-only image/manifest snapshot. Inventory supplies native identities; selection is recomputed against current index. Source-key-only glass entries are declared bindings, not claimed exercised in official-game maps. No asset resize.'}
(OUT/'world-fourfold-dimensions-audit-all25-q92.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(summary,indent=2));print('CONFLICTS',json.dumps([g for g in ordered if g['conflictingTargetDimensions']],indent=2))
print('DIFFUSE MISMATCH GROUPS')
for g in ordered:
 if g['mismatch']and'diffuse'in g['roles']:print(g['file'],g['currentDimensions'],'->',[(t['dimensions'],sorted(set(b['name']for b in t['bindings'])))for t in g['targets']])
print('COMPANION DIMENSION DISAGREEMENTS',json.dumps([{'name':r['name'],'key':r['nativeKey'],'file':r['file'],'diffuse':r['image'].get('dimensions'),'companions':[c for c in r['companions']if not c['matchesDiffuse']]}for r in rows if any(not c['matchesDiffuse']for c in r['companions'])],indent=2))
print('SCALARS',json.dumps(scalars,indent=2))
print('INDEX STILL SAME',hashlib.sha256((BASE/'index.json').read_bytes()).hexdigest()==summary['indexSha256'])
