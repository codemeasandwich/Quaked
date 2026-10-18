"""Normalize a reviewed photograph and align its eight-course phase without blur.

Reuses the existing quiet-edge Y colour correction BEFORE a rigid circular
four-runtime-row shift. No source pixels/noise, brick rescaling or sharpening.
"""
from pathlib import Path
from PIL import Image
import argparse,importlib.util,json,hashlib
import numpy as np

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-root',type=Path,required=True);p.add_argument('--input',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();assert not a.output.exists()and not a.output.with_suffix('.json').exists();tool=a.source_root/'tools/texture_sheets/sources/official-world-2026-10-12/finish_quiet_edges.py';spec=importlib.util.spec_from_file_location('quiet_photo_edges',tool);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);image=Image.open(a.input).convert('RGB');pixels=np.asarray(image.resize((512,256),Image.Resampling.LANCZOS));fixed,mask,clipping=m.finish(pixels,'y');out=np.roll(fixed,4,axis=0);Image.fromarray(out).save(a.output);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();receipt={'qualification':'Reviewed8coursephoto phase refinement, not acceptance; oldwrap corrected tonally before becoming an interior row after rigid shift','input':str(a.input),'inputSha256':sha(a.input),'inputDimensions':list(image.size),'dimensions':[512,256],'nativeDimensions':[128,64],'factor':4,'normalizationResampling':'Lanczos to exact4x before phase operation','preRollQuietEdgeAxes':'y','quietEdgeTool':str(tool),'quietEdgeToolSha256':sha(tool),'quietEdgeClippingFraction':clipping,'quietEdgeSpatialResampling':False,'cyclicRowShiftRuntime':4,'cyclicRowShiftNative':1,'sourceMortarBands':'28..31+32*k at runtime','photographicMortarMinimaBefore':'26+32*k','photographicMortarMinimaAfter':'30+32*k','phaseStepResampling':False,'output':str(a.output),'outputSha256':sha(a.output),'wrapperSha256':sha(Path(__file__))};a.output.with_suffix('.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'output':str(a.output),'shift':4,'sharpening':False}))
if __name__=='__main__':main()
