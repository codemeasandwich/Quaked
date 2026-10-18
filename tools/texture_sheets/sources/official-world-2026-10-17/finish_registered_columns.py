"""Reuse the unchanged photographic finisher's landmark path on transposed inputs.

Only X geometry is registered. Native half-size colour fitting remains the same;
there is no sharpening or native pixel-noise reconstruction. The later quiet-edge
receipt describes its own colour-only stage, not this spatial registration.
"""
from pathlib import Path
from PIL import Image
import argparse,hashlib,json,importlib.util

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-root',type=Path,required=True);p.add_argument('--original',type=Path,required=True);p.add_argument('--generated',type=Path,required=True);p.add_argument('--landmarks',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();assert not a.output.exists()and not a.output.with_suffix('.json').exists();tool=a.source_root/'tools/texture_sheets/finish_official_texture.py';spec=importlib.util.spec_from_file_location('official_photo_finish',tool);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);original=Image.open(a.original).convert('RGB');generated=Image.open(a.generated).convert('RGB');assert original.size==(256,256);pairs=json.loads(a.landmarks.read_text());out,recipe=m.finish(original.transpose(Image.Transpose.TRANSPOSE),generated.transpose(Image.Transpose.TRANSPOSE),factor=4,vertical_landmarks=pairs,comparison_divisor=2,method='photographic',color_strength=1,field_sigma=2);out=out.transpose(Image.Transpose.TRANSPOSE);out.save(a.output);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();receipt={'qualification':'X-only photographic landmark registration via unchanged finisher transposition; independent full/distance/edge/relief acceptance remains required','original':str(a.original),'originalSha256':sha(a.original),'generated':str(a.generated),'generatedSha256':sha(a.generated),'landmarks':str(a.landmarks),'landmarksSha256':sha(a.landmarks),'registrationAxis':'x','coordinateUnits':'native texels','spatialResampling':True,'transposeBeforeAndAfter':True,'factor':4,'output':str(a.output),'outputSha256':sha(a.output),'finisher':str(tool),'finisherSha256':sha(tool),'wrapperSha256':sha(Path(__file__)),'transposedFinisherRecipe':recipe};a.output.with_suffix('.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'output':str(a.output),'registrationAxis':'x','halfMAE':recipe['distanceMeanMAE']}))
if __name__=='__main__':main()
