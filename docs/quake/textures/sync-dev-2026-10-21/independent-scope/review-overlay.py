"""Read-only exact manifest scope/preservation audit; writes this review folder only."""
from pathlib import Path,PurePosixPath
import hashlib,json,re,collections,datetime
P=Path(__file__).resolve().parent;ROOT=P.parents[4];M=P.parent/'preliminary-owned-overlay.json'
def sha(b):return hashlib.sha256(b).hexdigest()
raw=M.read_bytes();manifest=json.loads(raw);rows=manifest['changed'];assert len(rows)==1135 and sum(r['bytes']for r in rows)==273918966
names=[r['file']for r in rows];assert len(names)==len(set(names));actual=[];issues=[];sensitive=[];textbytes=0
for row in rows:
 name=row['file'];p=ROOT/name;parts=PurePosixPath(name).parts
 scope='owned Quake authoring source'if name.startswith(('assets/authoring/texture_sheets/sources/quake-world-2026-10-20/','assets/authoring/texture_sheets/sources/quake-model-skins-2026-10-21/'))else 'owned Quake documentation/evidence'if name.startswith('docs/quake/')else 'OUTSIDE actual admitted namespace'
 if scope.startswith('OUTSIDE'):issues.append({'file':name,'issue':scope})
 if PurePosixPath(name).is_absolute()or'..'in parts or p.is_symlink()or not p.is_file():issues.append({'file':name,'issue':'path traversal/symlink/not regular file'});continue
 if not p.resolve().is_relative_to(ROOT):issues.append({'file':name,'issue':'resolved outside root'});continue
 data=p.read_bytes();digest=sha(data);blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();matches=digest==row['sha256']and len(data)==row['bytes']and blob==row['gitBlob']
 if not matches:issues.append({'file':name,'issue':'actual file differs from pinned manifest','currentSha256':digest})
 blocked=bool(re.search(r'(^|/)(?:\.git|\.aws|node_modules|target|dist|build|src|resources|games|\.state|\.env)(?:/|$)|(?:\.pak|\.bsp|\.sqlite3?|\.db|\.pem|\.key|\.p12|\.dmg|\.app|\.wasm|\.dylib|\.a|\.o|\.bin)$',name,re.I))
 if blocked:issues.append({'file':name,'issue':'prohibited path/suffix candidate'})
 if re.search(r'hexen|box.?art|release',name,re.I):issues.append({'file':name,'issue':'foreign/game/release path candidate'})
 signature='text or raw evidence'
 if p.suffix=='.png':
  if not data.startswith(b'\x89PNG\r\n\x1a\n'):issues.append({'file':name,'issue':'PNG extension magic mismatch'})
  signature='PNG evidence/source'
 elif p.suffix=='.npy':
  if not data.startswith(b'\x93NUMPY'):issues.append({'file':name,'issue':'NPY extension magic mismatch'})
  signature='retained scalar authoring array'
 elif p.suffix=='.rgba':
  if len(data)!=64*64*4:issues.append({'file':name,'issue':'native RGBA dimension mismatch'})
  signature='64x64 raw RGBA native evidence'
 else:
  try:text=data.decode('utf-8')
  except UnicodeDecodeError:issues.append({'file':name,'issue':'unexpected binary in text extension'});text=''
  textbytes+=len(data)
  for label,pattern in [('OpenAI-shaped credential',r'\bsk-[A-Za-z0-9_-]{20,}\b'),('GitHub-shaped credential',r'\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b'),('AWS-shaped access ID',r'\bAKIA[A-Z0-9]{16}\b'),('private key block',r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')]:
   if re.search(pattern,text):sensitive.append({'file':name,'pattern':label})
  if p.suffix=='.json':
   try:json.loads(text)
   except Exception:issues.append({'file':name,'issue':'invalid JSON'})
 if data[:4]==b'PACK' or data[:4]in [b'\x1d\x00\x00\x00',b'BSP2',b'2PSB']:issues.append({'file':name,'issue':'native PAK/BSP magic payload'})
 actual.append({'file':name,'scope':scope,'bytes':len(data),'sha256':digest,'gitBlob':blob,'matchesPinnedManifest':matches,'type':signature,'status':row['status']})
assert sha(M.read_bytes())==sha(raw),'Manifest changed during review'
exception=ROOT/'docs/quake/textures/dev-checkpoint-2026-10-21/obsolete-web-retirement/first-index.html';before=json.loads((exception.parent/'before-inventories.json').read_text());expected=before['first']['files']['web/index.html'];assert sha(exception.read_bytes())==expected['sha256']and exception.stat().st_size==expected['bytes'];html=exception.read_text()
ogre=json.loads((ROOT/'assets/authoring/texture_sheets/sources/quake-model-skins-2026-10-21/ogre/source-001/retained.json').read_text());assert ogre['verdict']=='HOLD_INADEQUATE_SOURCE_DIMENSIONS'and not ogre['selectionOrMasterOrTiersCreated']
report={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewer':'independent screenshot-scene agent','manifest':{'file':str(M.relative_to(ROOT)),'sha256':sha(raw),'baseline':manifest['baseline'],'originDev':manifest['originDev'],'changedFiles':len(rows),'changedBytes':sum(x['bytes']for x in rows)},'scopeVerdict':'PASS exact path/ownership namespace and actual byte preservation; retained build-evidence exception explicitly disclosed below'if not issues and not sensitive else 'HOLD investigate listed issues','counts':{'actualFiles':len(actual),'uniquePaths':len(set(names)),'added':sum(r['status']=='A'for r in rows),'modified':sum(r['status']=='M'for r in rows),'missingBaselinePaths':len(manifest['missingBaselinePaths']),'textBytesScanned':textbytes,'actualSha256SizeAndBlobMatches':sum(x['matchesPinnedManifest']for x in actual)},'pathGroups':dict(collections.Counter(a['scope']for a in actual)),'modifiedPaths':[x['file']for x in actual if x['status']=='M'],'issues':issues,'credentialShapeFindings':sensitive,'buildEvidenceException':{'file':str(exception.relative_to(ROOT)),'bytes':expected['bytes'],'sha256':expected['sha256'],'classification':'Retained obsolete web wrapper evidence, deliberately preserved with normal-hook receipt, before inventory, metafile and retirement receipt. It is generated HTML code; do not relabel as a source-only Markdown receipt. It is not under a scratch build root and is not a native binary/game PAK.','matchesOriginalRetirementInventory':True,'base64Occurrences':html.count('base64'),'literalPACKOccurrences':html.count('PACK'),'companionDataPayloadsInManifest':any(re.search(r'\.(?:bin|pak|bsp)$',n,re.I)for n in names)},'retainedRawArrays':['docs/quake/textures/owner-art-repair-2026-10-21/city-wizard-intake/city5_3-native.rgba','docs/quake/textures/owner-art-repair-2026-10-21/city-wizard-intake/wizmet1_3-native.rgba'],'ogreHold':{'verdict':ogre['verdict'],'dimensions':[ogre['retained']['width'],ogre['retained']['height']],'requiredDimensions':ogre['requestedDimensions'],'selectionOrMasterOrTiersCreated':ogre['selectionOrMasterOrTiersCreated'],'retainedFileCount':sum(n.startswith('assets/authoring/texture_sheets/sources/quake-model-skins-2026-10-21/ogre/source-001/')for n in names)},'findings':['All1135 actual overlay files match pinned SHA256, byte count and conventional Git blob hash.','No current overlay path changes engine, installed texture/enemy catalog/runtime assets, Hexen work, box art, release tree, policies, maintained tools or tests.','Only three M paths are Quake HANDOVER.md, MISSION.md and progress.json; no deletions listed.','Docs evidence scripts are not installed engine/tool changes. Two native raw RGBA files and two authored float NPY masters are bounded evidence, not native PAK or build binaries.','Colour sources remain uninstalled trials; Ogre return remains explicit inadequate-dimension HOLD. This review does not convert art/material/UV/height/GPU/source acceptance.'],'limits':['Path ownership is based on authorized root lane and exact file namespace; this review does not independently re-judge923 image artifacts or all prior author claims.','Credential scan checks common token/private-key patterns in all UTF8 text payloads; a no-match result is limited to those patterns.','This exact review binds preliminary1135 manifest only. Later overlay additions/revisions, current-origin merge resolution, normal gates, final commit tree and pull/readback require root reconciliation.','No Git mutation, provider call, launch, native build or installed asset change performed.'],'files':actual,'reviewDriverSha256':sha(Path(__file__).read_bytes())}
(P/'review.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k]for k in ['scopeVerdict','counts','pathGroups','modifiedPaths','issues','credentialShapeFindings']},indent=2))
