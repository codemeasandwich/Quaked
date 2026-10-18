"""Exercise the public importer CLI in disposable fixtures; real assets are read only."""
from pathlib import Path
import subprocess,shutil,tempfile,json,hashlib,sys
r=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parents[5];py=sys.executable
sys.path.insert(0,str(r/'tools'))
from resource_paths import resource_path
source=Path('tools/texture_sheets/sources/demon-2026-10-03')
paths=[Path(p) for p in ['tools/sculpt_demon_faces.py','tools/craft_normals.py','tools/resource_paths.py','assets/layout.json','newer/textures/index.json','newer/textures/normals/demon-face.r16','newer/textures/normals/demon-face.webp','newer/textures/dem4_1.webp','newer/textures/dem4_4.webp','newer/textures/dem5_3.webp']]+[source/'manifest.json',source/'dem4_4_displacement_16bit.png']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory(prefix='quaked-demon-source-',dir='/private/tmp') as tmp:
 t=Path(tmp)
 for path in paths:
  dest=t/resource_path(r,path).relative_to(r);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(resource_path(r,path),dest)
 resource_path(t,'docs/images').mkdir(parents=True)
 protected={str(p):sha(resource_path(t,p)) for p in paths}
 def run(*args):return subprocess.run([py,str(t/'tools/sculpt_demon_faces.py'),*args],capture_output=True,text=True,env={'PYTHONDONTWRITEBYTECODE':'1'})
 ok=run('--check');assert ok.returncode==0,ok.stderr
 assert protected=={str(p):sha(resource_path(t,p)) for p in paths}
 raw=resource_path(t,'newer/textures/normals/demon-face.r16');saved=raw.read_bytes();raw.write_bytes(saved[:-2])
 before={str(p):sha(resource_path(t,p)) for p in paths};bad=run('--check');assert bad.returncode!=0 and 'Installed R16 differs' in bad.stderr,bad.stderr
 assert before=={str(p):sha(resource_path(t,p)) for p in paths};raw.write_bytes(saved)
 displacement=t/source/'dem4_4_displacement_16bit.png';original=displacement.read_bytes();displacement.write_bytes(original+b'x')
 before={str(p):sha(resource_path(t,p)) for p in paths};bad=run('--check');assert bad.returncode!=0 and 'Displacement checksum mismatch' in bad.stderr,bad.stderr
 assert before=={str(p):sha(resource_path(t,p)) for p in paths};displacement.write_bytes(original)
 imported=run();assert imported.returncode==0,imported.stderr
 assert raw.read_bytes()==saved
 assert json.loads(resource_path(t,'newer/textures/index.json').read_text())['version']==int(json.loads(resource_path(r,'newer/textures/index.json').read_text())['version'])+1
 checked=run('--check');assert checked.returncode==0,checked.stderr
 assert not (t/'docs/evidence').exists()
 print('PASS: read-only check writes no input/output files; truncated R16 and corrupt displacement reject without writes; normal import succeeds in scratch, preserves exact R16, advances the catalog revision by one, creates no duplicate evidence recipe, and passes --check.')
