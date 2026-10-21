"""Independent saved-artifact/state proof, not a GPU shader implementation.
Reads the sealed sixteen-pose wood3_6 set and actual decoded source maps only.
"""
from pathlib import Path
import datetime
import hashlib
import json

import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[6]
HERE=Path(__file__).resolve().parent
OUT=HERE/'independent-capture-set-public-proof.json'
assert not OUT.exists()
sha=lambda data:hashlib.sha256(data).hexdigest()
watched={}
def read(path):
    path=Path(path).resolve();path.relative_to(ROOT);data=path.read_bytes()
    digest=sha(data);assert path not in watched or watched[path]==digest
    watched[path]=digest;return data
def checked(row):
    path=ROOT/row['file'];data=read(path);assert sha(data)==row['sha256'];return path,data
def image(path):
    read(path);return np.asarray(Image.open(path).convert('RGBA'))
set_path=HERE/'capture-set.json';set_bytes=read(set_path)
assert sha(set_bytes)=='50c4eec0d9613d2f0ca96f01a7a0a513c5bd9d674638883fb0cf93b6a516965d'
capture_set=json.loads(set_bytes);assert capture_set['material']=='wood3_6' and len(capture_set['captures'])==16
batch_path,batch_bytes=checked(capture_set['candidateBatch']);batch=json.loads(batch_bytes)
assert len(batch['items'])==1 and batch['items'][0]['name']=='wood3_6'
item=batch['items'][0]
for row in capture_set['codeAtCapture']:checked(row)
for row in capture_set['boundInputs']:checked(row)
expected_base=[('close',1,0,'-1',True),('close',1,0,'1',True),
 ('half',3,0,'-1',True),('quarter',3,0,'-1',True),
 ('close',1,-55,'-1',True),('close',1,-55,'-1',False),
 ('close',1,55,'1',True),('close',1,55,'1',False)]
expected={(tier,*pose) for tier in ['Mid','High'] for pose in expected_base}
actual_keys=[];frame_hashes=set();packed={};arrays={};input_union={};captures=[]
for capture in capture_set['captures']:
    files=capture['files'];receipt_path,receipt_bytes=checked(files['receipt'])
    receipt=json.loads(receipt_bytes);draw=receipt['lastDraw']
    assert receipt['batch']==str(batch_path.relative_to(ROOT)) and receipt['state']=='ready'
    assert not receipt['shaderErrors'] and all(x['passed'] for x in receipt['checks'])
    assert len(receipt['draws'])==capture['drawHistoryCount'] and len(receipt['checks'])==capture['checks']
    assert draw==capture['actual'] and draw['name']=='wood3_6' and type(draw['relief'])is bool
    assert 'Apple M2' in receipt['webgl']['renderer'] and 'WebGL 2.0' in receipt['webgl']['version']
    key=(draw['tier'],draw['view'],draw['repeat'],draw['angleDegrees'],draw['light'],draw['relief'])
    assert key in expected;actual_keys.append(key)
    for rel,witness in receipt['inputs'].items():
        assert sha(read(ROOT/rel))==witness['sha256']
        assert rel not in input_union or input_union[rel]==witness['sha256']
        input_union[rel]=witness['sha256']
    tier=draw['tier'];paths=item['tiers'][tier]['files'];size=256 if tier=='Mid' else 512
    assert draw['dimensions']==draw['framebuffer']==[size,size]
    if tier not in packed:
        packed[tier]=sha(np.stack([image(ROOT/paths[k])[:,:,0] for k in ['normalX','normalY','normalZ','height']],axis=2).tobytes())
        arrays[tier]=(image(ROOT/item['original']),image(ROOT/paths['diffuse']))
    assert packed[tier]==draw['normalPackedSha256']
    gpu_path,_=checked(files['gpu']);gpu=image(gpu_path)
    assert gpu.shape==(size,size,4)
    framebuffer=sha(gpu[::-1].tobytes())
    assert framebuffer==draw['framebufferRgbaBottomUpSha256'];frame_hashes.add(framebuffer)
    native,replacement=arrays[tier]
    if draw['view']!='close':
        divisor=2 if draw['view']=='half' else 4
        height,width=native.shape[0]//divisor,native.shape[1]//divisor
        def box(source):
            sy,sx=source.shape[0]//height,source.shape[1]//width
            sums=source.astype(np.uint64).reshape(height,sy,width,sx,4).sum(axis=(1,3))
            return ((sums*2+sx*sy)//(2*sx*sy)).astype(np.uint8)
        native,replacement=box(native),box(replacement)
    assert draw['comparisonDimensions']==[[native.shape[1],native.shape[0]],[replacement.shape[1],replacement.shape[0]]]
    comparison=np.zeros((max(native.shape[0],replacement.shape[0]),native.shape[1]+replacement.shape[1],4),np.uint8)
    comparison[:native.shape[0],:native.shape[1]]=native
    comparison[:replacement.shape[0],native.shape[1]:]=replacement
    comparison_path,_=checked(files['comparison'])
    assert np.array_equal(image(comparison_path),comparison)
    captures.append({'label':capture['label'],'actualPose':key,'receiptSha256':sha(receipt_bytes),
      'framebufferRgbaBottomUpSha256':framebuffer,'GPUDecodeExactFrameSHA':True,
      'comparisonPixelsExact':True,'packedAuthoredXYZHeightExact':True})
assert len(actual_keys)==len(set(actual_keys))==16 and set(actual_keys)==expected
assert len(frame_hashes)==14
assert input_union=={row['file']:row['sha256']for row in capture_set['boundInputs']}
assert len(input_union)==13
for tier in ['Mid','High']:
    rows=[x for x in captures if x['actualPose'][0]==tier]
    for angle,light in [(-55,'-1'),(55,'1')]:
        relief=next(x for x in rows if x['actualPose']==(tier,'close',1,angle,light,True))
        flat=next(x for x in rows if x['actualPose']==(tier,'close',1,angle,light,False))
        assert relief['framebufferRgbaBottomUpSha256']!=flat['framebufferRgbaBottomUpSha256']
    half=next(x for x in rows if x['actualPose']==(tier,'half',3,0,'-1',True))
    quarter=next(x for x in rows if x['actualPose']==(tier,'quarter',3,0,'-1',True))
    assert half['framebufferRgbaBottomUpSha256']==quarter['framebufferRgbaBottomUpSha256']
for path,digest in watched.items():assert sha(path.read_bytes())==digest
read(__file__)
report={'schemaVersion':1,'verdict':'PASS_INDEPENDENT_ALL16_SAVED_HARDWARE_POSE_STATE_AND_ARTIFACT_BINDINGS',
 'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'scope':'One sealed repairedwood3_6 capture set: savedPNG/state/input/packedchannel/BOX identity, not independentGPUshaderreproduction or ARTacceptance.',
 'captureSet':{'file':str(set_path.relative_to(ROOT)),'sha256':sha(set_bytes)},
 'counts':{'poses':16,'Mid':8,'High':8,'uniqueFramebuffers':14,'sourceInputs':13,'GPUComparisonReceiptTriples':16},
 'matrixExactAndUnique':True,'M2WebGL2AllReceipts':True,'allReceiptsReadyNoShaderErrors':True,
 'allInputHashesCurrent':True,'packedXYZHeightBothTiersExact':True,'all16PNGFlipRGBAMatchActualFramebufferSHA':True,
 'all16ComparisonPNGsPixelExact':True,'comparisonContract':'One native/replacementpair, independentintegerBOXorunscaledclose; GPUrepeat3doesnotrepeatdownloadpair.',
 'reliefFlatFramesDifferAllFourPairs':True,'halfQuarterRepeatedGPUIdentityExplicit':True,
 'captures':captures,'verifier':{'file':str(Path(__file__).relative_to(ROOT)),'sha256':sha(Path(__file__).read_bytes())},
 'watchedInputs':[{'file':str(path.relative_to(ROOT)),'sha256':digest}for path,digest in watched.items()],
 'limits':['Actualsavedcapturebinding proofonly; no independentGPUshadercalculation, installedloader/fullmap/nativefamily/owner/Dev/CI/releaseclaim.',
 'No browser/nativeUI/Saveaction bythisverifier; originalnativeSaveautorejection remainsunresolvedandunretried. RootreportedseparateworkingdocumentedbrowserDOMcapturepath.',
 'No render/math/source/master/tier/sharedproducer/asset/catalog/Git/Hexen/Desktop changes or binarycopies; onlyownedverifierandJSONproofwritten.']}
OUT.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'verdict':report['verdict'],'counts':report['counts'],'watchedInputs':len(watched)}))
