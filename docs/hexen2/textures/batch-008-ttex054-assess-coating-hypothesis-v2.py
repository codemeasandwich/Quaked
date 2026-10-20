#!/usr/bin/env python3
"""Source-only classification evidence. Does not produce an albedo or height map."""
from pathlib import Path
from datetime import datetime, timezone
import json
import hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[3]
B=ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/batch-008'
D=B/'relief/ttex054-guide-draft-v2'
REPORT=ROOT/'docs/hexen2/textures/batch-008-ttex054-guide-proposal-v2.json'

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def bound(p): return {'file':str(p.relative_to(ROOT)),'sha256':sha(p),'bytes':p.stat().st_size}
def savej(p,v): p.write_text(json.dumps(v,indent=2)+'\n')
def font(n=16): return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',n)

def main():
    assert not D.exists() and not REPORT.exists()
    source=B/'masters/ttex054/color.png'
    assert sha(source)=='75735d60f4199165c89f02f38d96a021ce471ddd4acd4ca5196a6fae6abf1eba'
    prior=ROOT/'docs/hexen2/textures/batch-008-ttex054-guide-proposal.json'
    assert sha(prior)=='5b540cd2ed3f41ceeb98ee530bac7e94570a99e1d57669e9d49dc14ae3a58f42'
    old=B/'relief/ttex054-guide-draft'
    protected=[source,B/'masters/ttex054/height.npy',B/'masters/ttex054/master.json',
               B/'generated/ttex054.png',B/'prompts/ttex054-material-v2.txt',prior]
    protected.extend(p for p in sorted(old.iterdir()) if p.is_file())
    before=[bound(p) for p in protected]
    im=Image.open(source).convert('RGB');rgb=np.asarray(im,dtype=float)/255
    lum=rgb@np.array([.299,.587,.114])
    # Locations proposed by a chromaticity-only patch search, then actually
    # inspected as crops. No search mask is used as a guide or pixel classifier.
    boxes=[(52,692,62,702),(236,772,248,784),(300,716,310,726),
           (412,764,424,776),(372,818,382,828),(396,790,406,800),
           (36,1004,46,1014),(96,1008,108,1020),(188,996,200,1008),
           (452,980,464,992)]
    patches=[]
    for i,(x0,y0,x1,y1) in enumerate(boxes):
        a=rgb[y0:y1,x0:x1];l=lum[y0:y1,x0:x1]
        rg=a[:,:,0]/np.maximum(a[:,:,1],1e-6);gb=a[:,:,1]/np.maximum(a[:,:,2],1e-6)
        patches.append({'label':'R%02d'%(i+1),'boxMasterPixels':[x0,y0,x1,y1],
             'nativePixelEdgeBox':[v/8 for v in (x0,y0,x1,y1)],
             'medianRGB':np.median(a,axis=(0,1)).tolist(),
             'medianLuminance':float(np.median(l)),'p10p90Luminance':np.quantile(l,[.1,.9]).tolist(),
             'p10RedGreenRatio':float(np.quantile(rg,.1)),
             'p10GreenBlueRatio':float(np.quantile(gb,.1)),
             'status':'Actual crop inspected: predominantly red coating, with some retained aggregate/specular specks; not a depth classification'})
    values=np.array([p['medianLuminance'] for p in patches])
    baseline=float(np.median(values))
    calibration={'value':baseline,'method':'Median of equal-weight medians of ten actual red-chroma patch observations',
                 'rangePatchMedians':[float(values.min()),float(values.max())],
                 'leaveOneOutMedianRange':[float(min(np.median(np.delete(values,i)) for i in range(len(values)))),
                                          float(max(np.median(np.delete(values,i)) for i in range(len(values))))],
                 'limitations':'This is a source-specific red-coating reflectance proxy, not physical albedo measurement. Chroma selection may bias towards intact dense pigment; actual patch scatter/aggregate remains visible. Independent review required.'}
    old_recipe=json.loads((old/'classification-and-calibration.json').read_text())
    m={c['class']:c['value'] for c in old_recipe['calibrations']}
    profiles=[]
    spans=[(35,85),(160,210),(292,342),(420,470)]
    for i,(x0,x1) in enumerate(spans):
        row_medians=np.median(lum[574:605,x0:x1],axis=1)
        gold=float(np.median(lum[583:591,x0:x1]))
        above=float(np.median(lum[574:579,x0:x1]))
        below=float(np.median(lum[596:601,x0:x1]))
        top=float(np.median(lum[581:583,x0:x1]))
        rim=float(np.median(lum[592:594,x0:x1]))
        j=[gold/m['ochre'],above/m['dark-ornament'],below/m['dark-ornament']]
        profiles.append({'label':'E%d'%(i+1),'xHalfOpen':[x0,x1],'yHalfOpen':[574,605],
           'sourceRowMedianLuminance':row_medians.tolist(),
           'sourceMedianRGBByRow':np.median(rgb[574:605,x0:x1],axis=1).tolist(),
           'measuredTopTransitionBetweenPixelCentres':[580,581],
           'measuredBottomTransitionBetweenPixelCentres':[591,592],
           'coordinateMeaning':'Actual median-profile steep change, not a complete source edge trace or measured alpha coverage',
           'coreGoldMedian':gold,'darkAboveMedian':above,'darkBelowMedian':below,
           'brightUpperGoldRows581To583Median':top,'darkLowerRimRows592To594Median':rim,
           'sourceRatioDiagnosticNotHeight':{'globalDraftGoldProxy':m['ochre'],
                 'globalDraftDarkProxy':m['dark-ornament'],'goldOverProxy':j[0],
                 'darkAboveOverProxy':j[1],'darkBelowOverProxy':j[2],
                 'goldMinusMeanAdjacentDark':j[0]-(j[1]+j[2])/2,
                 'darkRimRelativeToDarkBelow':rim/below},
           'verdict':'HOLD for complete guide: global two-pigment scalar calibration leaves coherent cross-stroke/rim residual; no height computed'})
    D.mkdir(parents=True)
    # Actual calibration crops, labelled and nearest enlarged, never smoothed.
    contact=Image.new('RGB',(1250,610),'#191919');cd=ImageDraw.Draw(contact)
    cd.text((15,10),'LOWER RED COATING CALIBRATION: ACTUAL PIXEL CROPS, NOT DEPTH',font=font(20),fill='white')
    for i,p in enumerate(patches):
        x=i%5*250+12;y=55+i//5*270
        contact.paste(im.crop(tuple(p['boxMasterPixels'])).resize((180,180),Image.Resampling.NEAREST),(x,y))
        cd.text((x,y+186),p['label']+' '+str(p['boxMasterPixels']),font=font(13),fill='white')
        cd.text((x,y+209),'median L %.6f'%p['medianLuminance'],font=font(16),fill='white')
        cd.text((x,y+232),'R/G P10 %.3f'%p['p10RedGreenRatio'],font=font(14),fill='white')
    contact.save(D/'red-coating-calibration-crops.png')
    # Full registered source annotated with calibration/wear/edge witnesses.
    page=Image.new('RGB',(1300,1120),'#191919');pd=ImageDraw.Draw(page)
    pd.text((15,10),'V2 HYPOTHESIS REVIEW - LOWER ONE-COATING INTERPRETATION; COMPLETE GUIDE STILL HOLD',font=font(20),fill='white')
    page.paste(im,(15,60)); ann=im.copy();ad=ImageDraw.Draw(ann)
    for p in patches:
        x0,y0,x1,y1=p['boxMasterPixels'];ad.rectangle((x0,y0,x1-1,y1-1),outline='yellow',width=1)
        ad.text((x0,y0-15),p['label'],fill='yellow',font=font(12))
    witness_boxes=[('W1',(12,690,90,770)),('W2',(304,772,382,850)),('W3',(185,68,263,88)),('W4',(185,484,263,511))]
    for label,box in witness_boxes:
        x0,y0,x1,y1=box;ad.rectangle((x0,y0,x1-1,y1-1),outline='cyan',width=2)
        ad.text((x0,y0-16),label,fill='cyan',font=font(13))
    for p in profiles:
        x0,x1=p['xHalfOpen'];ad.rectangle((x0,574,x1-1,604),outline='white',width=1)
        ad.text((x0,573-16),p['label'],fill='white',font=font(12))
    page.paste(ann,(548,60))
    txt=["Original RGB and annotated source, unchanged.","Yellow: proposed red-coating calibration.","Cyan W1/W2: dark islands retained as shallow coating loss/flake/pit interpretation, not new macroscopic depth planes.","Cyan W3/W4: narrow band-rim crack/flake candidates, not physical band steps.","White E1-E4: actual measured gold/dark edge profiles. Two global pigment constants leave coherent residual contrast.","No second albedo guide, corrected height, normal or tier is produced. First draft remains unchanged."]
    yy=70
    import textwrap
    for text in txt:
        for line in textwrap.wrap(text,width=24):
            pd.text((1080,yy),line,font=font(15),fill='white');yy+=20
        yy+=18
    page.save(D/'source-hypothesis-and-witnesses.png')
    # Source profile charts include actual strip crop, raw L and ratio diagnostic.
    chart=Image.new('RGB',(1350,1030),'#191919');dr=ImageDraw.Draw(chart)
    dr.text((15,10),'SOURCE COLOUR-BOUNDARY DIAGNOSTICS - NO HEIGHT / NORMAL OUTPUT',font=font(21),fill='white')
    for i,p in enumerate(profiles):
        ox=i%2*670+20;oy=i//2*490+60;x0,x1=p['xHalfOpen']
        dr.text((ox,oy),p['label']+' x [%d,%d), rows [574,605)'%(x0,x1),font=font(17),fill='white')
        chart.paste(im.crop((x0,574,x1,605)).resize((200,124),Image.Resampling.NEAREST),(ox,oy+28))
        plotx,ploty=ox+240,oy+30;pw,ph=360,230
        for y in [0,.1,.2,.3,.4]:
            py=ploty+ph*(1-y/.4);dr.line((plotx,py,plotx+pw,py),fill='#555555')
            dr.text((plotx-34,py-7),'%.1f'%y,font=font(12),fill='white')
        points=[]
        for k,v in enumerate(p['sourceRowMedianLuminance']):
            points.append((plotx+pw*k/30,ploty+ph*(1-v/.4)))
        dr.line(points,fill='#ffdd55',width=3)
        for yy in [580.5,591.5]:
            xx=plotx+pw*(yy-574)/30;dr.line((xx,ploty,xx,ploty+ph),fill='#55ffff',width=1)
            dr.text((xx-14,ploty+ph+8),str(yy),font=font(12),fill='#55ffff')
        dr.text((plotx,ploty+ph+30),'y (source pixel centres); median L',font=font(13),fill='white')
        q=p['sourceRatioDiagnosticNotHeight']
        rows=['Core gold / proxy: %.3f'%q['goldOverProxy'],
              'Dark above / proxy: %.3f'%q['darkAboveOverProxy'],
              'Dark below / proxy: %.3f'%q['darkBelowOverProxy'],
              'Gold - adjacent dark: %.3f'%q['goldMinusMeanAdjacentDark'],
              'Dark lower rim / nearby ground: %.3f'%q['darkRimRelativeToDarkBelow']]
        for j,s in enumerate(rows):dr.text((ox,oy+310+j*24),s,font=font(16),fill='white')
    chart.save(D/'actual-ornament-edge-profiles.png')
    analysis={
      'schemaVersion':1,'recordedAt':datetime.now(timezone.utc).isoformat(),
      'verdict':'HOLD overall: lower single-coating interpretation supported for independent review, complete ornament albedo guide not established',
      'sourceInputs':before,'priorDraftUnchanged':True,
      'authoredInterpretation':{'scopeMasterPixelRows':[664,1024],
        'material':'One thin red mineral coating on common plaster; small dark islands interpreted as shallow coating loss/flake/pit microtexture',
        'historicalOrMeasuredTruthClaim':False,'guidePolicyIfReviewed':'One constant positive class baseline across entire lower field, including every dark island. No island mask or macroscopic depth plane.',
        'protectedWitnesses':[{'label':label,'boxMasterPixels':list(box)} for label,box in witness_boxes],
        'constantGuideWouldPreserveObservedWear':'Multiplying/dividing every lower-field pixel by the same scalar cannot move, relabel, clone, remove or smooth its fine wear. This statement does not qualify future relief mapping or decoded Q92 retention.'},
      'redCoatingCalibration':calibration,'actualRedCoatingPatches':patches,
      'selectionMethod':'Candidate patches were located with R/G and G/B chroma constraints, no luminance/brightness ranking; fixed 10/12px boxes then actually inspected as nearest enlarged RGB crops. This is calibration sampling only, never pixel classification of pits/wear or an image-wide hue mask.',
      'goldAndDarkSourceProfiles':profiles,
      'remainingConcreteUnresolvedSupport':[
        {'region':'Ochre meander/dark ornament band','boxMasterPixels':[0,575,512,651],
         'issue':'Only four straight horizontal stroke spans have measured edge positions/profiles. Vertical strokes, the five return turns and inside corners do not yet have a complete actual source alpha/albedo trace. Approximate first-draft centreline is insufficient.'},
        {'region':'Gold upper/lower edge profiles','boxesMasterPixels':[[x0,579,x1,595] for x0,x1 in spans],
         'issue':'Global gold/dark median proxies leave source ratio differences and systematic upper-bright/lower-dark rims. A guessed smooth edge or arbitrary small relief amplitude would conceal rather than resolve the source-specific colour/illumination profile.'},
        {'region':'Broad horizontal paint bands and narrow rims','yRangesMasterPixels':[[14,23],[72,83],[489,506],[552,576],[650,670]],
         'issue':'Interpret narrow dark rims as preserved shallow crack/flake wear is plausible, but actual broad colour alpha transition and separate residual need measured profiles. Must avoid creating physical band steps.'}],
      'whyNoV2GuideArray':'Owner requested v2 guide only if faithfully demonstrated with no residual broad motif plateau. The lower-field hypothesis is useful, but measured ornament profiles falsify qualification from two global colour constants and an approximate outline. Do not fabricate complete weights/alpha or fit every image pixel. No second A/weights array authored.',
      'nextAction':{'owner':'Root and independent source/material reviewer',
        'action':'Review clean red calibration and authored one-coating interpretation. For ornament, decide source-bound pigment-density/illumination interpretation and measure complete stroke/corner soft transitions with independent witnesses before a full guide. Keep HOLD until that evidence exists; no wrapper or height correction is yet justified.'},
      'noRelaxation':['First draft HOLD remains intact','No historical truth inference','No macro planes per lower island','No new noise, smooth fill or cloning','No height amplitude chosen','No residual plateau waived','No corrected height/normal/map/master or generation'],
      'effects':'Only sibling source-classification/calibration diagnostics and report, no second guide, producer/asset master/tier/Git changes.'}
    savej(D/'coating-hypothesis-and-edge-measurements.json',analysis)
    assert before==[bound(p) for p in protected]
    analysis['outputs']=[bound(p) for p in sorted(D.iterdir()) if p.is_file()]
    analysis['builder']=bound(Path(__file__).resolve())
    analysis['sourceAndPriorDraftStableAtEnd']=True
    savej(REPORT,analysis)
    print(json.dumps({'report':bound(REPORT),'baseline':calibration,'verdict':analysis['verdict']},indent=2))

if __name__=='__main__':main()
