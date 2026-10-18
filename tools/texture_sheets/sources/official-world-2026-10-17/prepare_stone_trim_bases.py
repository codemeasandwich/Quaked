"""Two bounded photographic donor reuses from the independent next-eight plan.

Steel keeps all48physicalheads/rails without sharing a native identity. Copper
uses one512x64strip at unchanged photographic pixel scale, never whole-image
squashing. Source-specific fitting and new height/XYZ authoring follow.
"""
from pathlib import Path
import argparse,json,hashlib,shutil,sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from resource_paths import resource_path
from PIL import Image

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-root',type=Path,required=True);p.add_argument('--output-root',type=Path,required=True);a=p.parse_args();s=Path('tools/texture_sheets/sources/official-world-2026-10-17');plan=a.output_root/s/'verification/stone-trims-next-eight-independent-plan.json';assert hashlib.sha256(plan.read_bytes()).hexdigest()=='dfd7f5fe0e34606a113585ecdfed6d8df22b67c277eec13536e4644eb98905fb';d=json.loads(plan.read_text());pairs=[('TF_Metal3_04','sameFastenerGeometry'),('metal5_83_JM','quietCopper')];out=[a.output_root/s/(n+'-reviewed-photo-base-v1.png')for n,_ in pairs];receipt=a.output_root/s/'stone-trim-two-donor-reuse-v1.json';assert not any(p.exists()for p in out+[receipt]);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();inputs=[]
 for n,key in pairs:
  r=d['donors'][key];src=resource_path(a.source_root,r['file']);assert sha(src)==r['sha256'];im=Image.open(src);assert im.size==(512,512);inputs.append((n,src,im.convert('RGB'),r['file']))
 records=[]
 for (n,src,im,source_name),target in zip(inputs,out):
  if n=='TF_Metal3_04':shutil.copy2(src,target);op={'method':'exact-copy','headCount':48,'upperRows':[16,16],'lowerRows':[8,8],'alias':False}
  else:im.crop((0,224,512,288)).save(target);op={'method':'crop-without-resampling','box':[0,224,512,288],'wholePhotoDimensions':[512,512],'outputDimensions':[512,64]}
  records.append({'name':n,'source':source_name,'sourceSha256':sha(src),'output':str(target.relative_to(a.output_root)),'outputSha256':sha(target),'operation':op})
 receipt.write_text(json.dumps({'qualification':'Unregistered photographic donor geometry/material reuse, not exact-native alias or acceptance','planSha256':sha(plan),'toolSha256':sha(Path(__file__)),'entries':records},indent=2)+'\n');print(json.dumps({'receipt':str(receipt),'names':[r['name']for r in records]}))
if __name__=='__main__':main()
