import importlib.util,sys,json,subprocess
from pathlib import Path
from PIL import Image
import numpy as np
tool,package,output,mode=sys.argv[1:]
sys.path.insert(0,str(Path(tool).parent))
spec=importlib.util.spec_from_file_location('subject_adapter',tool);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
if mode=='original-after-replay':
 real=m.subprocess.run
 def wrapped(*args,**kw):
  result=real(*args,**kw)
  if result.returncode==0:
   parent=json.loads(Path(package).read_text());p=Path(parent['inputs']['original']['file'])
   a=np.asarray(Image.open(p).convert('RGB')).copy();a[:,:,0]=((a[:,:,0].astype('uint16')+37)%256).astype('uint8');Image.fromarray(a).save(p)
  return result
 m.subprocess.run=wrapped
elif mode in ('late-empty','late-symlink'):
 real=m.publish_exclusive
 def wrapped(source,destination):
  if mode=='late-empty':destination.mkdir()
  else:destination.symlink_to(destination.parent/'foreign-missing-target')
  return real(source,destination)
 m.publish_exclusive=wrapped
elif mode=='stage-write-failure':
 real=Path.write_bytes
 def wrapped(self,data):
  if self.parent.name=='successor' and self.name=='height.npy':raise OSError('injected owned staging failure')
  return real(self,data)
 Path.write_bytes=wrapped
elif mode=='unsupported':m.sys.platform='independent-unsupported'
sys.argv=[tool,'--package',package,'--axis','x','--output',output];m.main()
