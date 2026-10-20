#!/usr/bin/env python3
"""Record manual ttex054 source interpretations; never authors height."""
from pathlib import Path
import hashlib
import json
from PIL import Image,ImageDraw

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
OUT=HERE/'physical-survey-v1'
SOURCE=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008/masters/ttex054/color.png'

POLYGONS={
 'S015':[[124,230],[127,229],[128,232],[126,235],[123,235],[122,233]],
 'S020':[[241,232],[244,230],[244,234],[242,238],[240,237]],
 'S032':[[327,158],[332,159],[333,161],[331,164],[327,164],[325,161]],
 'S037':[[282,238],[285,238],[287,241],[285,243],[282,241]],
 'S041':[[406,249],[409,249],[410,251],[408,254],[405,253]],
 'S045':[[472,333],[475,333],[478,336],[476,339],[472,338],[470,335]],
 'S054':[[218,414],[221,414],[223,416],[222,419],[219,419],[217,417]],
 'S074':[[24,34],[27,34],[28,36],[26,39],[23,38],[22,36]],
 'S078':[[180,47],[184,47],[185,49],[182,51],[179,50]],
 'S089':[[170,528],[173,528],[175,530],[174,533],[171,533],[169,531]],
 'S093':[[384,523],[387,522],[390,525],[389,528],[385,529],[382,526]],
 'S094':[[424,515],[427,515],[429,517],[427,520],[424,519],[423,517]],
}
RAISED_OR_MIXED={2,11,12,13,14,16,21,23,25,28,29,30,34,35,38,39,42,43,44,47,48,49,52,53,58,59,62,63,64,65,66,67,68,70,71,72,73,75,79,80,81,82,83,84,85,86,87,90,91,92,95}


def main():
    rgb=Image.open(SOURCE).convert('RGB')
    rows=json.loads((OUT/'candidate-crops.json').read_text())
    for index,row in enumerate(rows,1):
        if row['label'] in POLYGONS:
            polygon=POLYGONS[row['label']]
            row.update(classification='PROPOSED_NEGATIVE_CAVITY_OR_CHIP_VOID',
                confidence='Source-directed interpretation requiring independent geometry review',
                polygonMasterPixels=polygon,polygonNativePixelCoordinates=[[x/8,y/8] for x,y in polygon],
                reason='Bounded physical cavity/edge candidate adjoining a plaster rim in actual enlarged source; not an entire paint-colour shape')
        elif index in RAISED_OR_MIXED:
            row.update(classification='MIXED_RAISED_FLAKE_OR_GRANULAR_AGGREGATE',
                reason='Dominant raised/mixed structure; dark neighbor alone does not identify negative pore floor. Omitted from negative-only candidate.')
        else:
            row.update(classification='UNRESOLVED_FINE_RELIEF_OR_COLOR',
                reason='Crop does not prove a negative cavity floor. Keep on common face for this diagnostic interpretation.')
    canvas=rgb.copy();draw=ImageDraw.Draw(canvas)
    for label,polygon in POLYGONS.items():
        draw.polygon([tuple(point) for point in polygon],outline='#00ffff')
        x,y=polygon[0];draw.text((x+4,y),label,fill='#00ffff')
    canvas.save(OUT/'proposed-cavity-source-overlay.png')
    contact=Image.new('RGB',(600,3*164),'#202020');draw=ImageDraw.Draw(contact)
    for k,(name,polygon) in enumerate(POLYGONS.items()):
        x0=min(x for x,y in polygon)-8;y0=min(y for x,y in polygon)-8
        x1=max(x for x,y in polygon)+9;y1=max(y for x,y in polygon)+9
        crop=rgb.crop((x0,y0,x1,y1)).resize((144,144),Image.Resampling.NEAREST)
        d=ImageDraw.Draw(crop)
        for a,b in zip(polygon,polygon[1:]+polygon[:1]):
            d.line(((a[0]-x0)*144/(x1-x0),(a[1]-y0)*144/(y1-y0),(b[0]-x0)*144/(x1-x0),(b[1]-y0)*144/(y1-y0)),fill='#00ffff',width=1)
        xx=k%4*150;yy=k//4*164;draw.text((xx+4,yy+3),name,fill='white');contact.paste(crop,(xx,yy+20))
    contact.save(OUT/'proposed-cavity-polygon-contact.png')
    report=dict(schemaVersion=1,status='PROPOSED geometry only; independent source classification required',
        source=dict(file=str(SOURCE.relative_to(ROOT)),sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest()),
        surveyCrops=rows,
        otherWholeFieldsViewed=['Full source RGB','lower-red-left-source-grid.png','lower-red-right-source-grid.png','gold/dark meander source-corner grids'],
        lowerRed='No unambiguous negative cavity selected: red/green dark islands remain coating-loss/pigment/lighting confounded, not a pit mask.',
        geometryApproval=False,counts={key:sum(row['classification']==key for row in rows) for key in sorted({row['classification'] for row in rows})})
    (OUT/'classified-survey.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report['counts']))


if __name__=='__main__':main()
