#!/usr/bin/env python3
"""Decode every supplied GIF frame without resizing; retain timing and hashes.
Usage: python inspect_water_reference.py SOURCE.gif OUTPUT_DIRECTORY
Requires Pillow. Contact sheets contain at most15 frames,3columns5rows.
"""
from pathlib import Path
import hashlib,json,sys
from PIL import Image,ImageSequence,ImageDraw
source=Path(sys.argv[1]);output=Path(sys.argv[2]);output.mkdir(parents=True,exist_ok=True)
gif=Image.open(source);frames=[];entries=[];time=0
for index,frame in enumerate(ImageSequence.Iterator(gif)):
    rgb=frame.convert('RGB').copy();duration=frame.info.get('duration',0)
    rgb.save(output/f'frame-{index+1:03d}.png');frames.append(rgb)
    entries.append({'frame':index+1,'start_ms':time,'duration_ms':duration,'end_ms':time+duration,'width':rgb.width,'height':rgb.height,'pixels_sha256':hashlib.sha256(rgb.tobytes()).hexdigest()});time+=duration
width,height=gif.size
for start in range(0,len(frames),15):
    subset=frames[start:start+15];sheet=Image.new('RGB',(width*3,(height+30)*((len(subset)+2)//3)),(18,18,18));draw=ImageDraw.Draw(sheet)
    for j,rgb in enumerate(subset):
        x=j%3*width;y=j//3*(height+30);entry=entries[start+j]
        draw.text((x+8,y+6),f"FRAME {entry['frame']:03d} | {entry['start_ms']/1000:.3f}s - {entry['end_ms']/1000:.3f}s | {entry['duration_ms']}ms",fill='white');sheet.paste(rgb,(x,y+30))
    sheet.save(output/f'sheet-{start//15+1:02d}.png')
record={'source_name':source.name,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'frame_count':len(frames),'duration_ms':time,'size':[width,height],'frames':entries}
(output/'frame-timing-ledger.json').write_text(json.dumps(record,indent=2)+'\n')
print(f'Decoded {len(frames)} frames;{time}ms;native {width}x{height}. No frames omitted.')
