"""Independently verify five current Quake direct-master codec migrations.

Read-only for assets. The only write is a new --report JSON. Expected reduction,
cyclic normal and Q92 bytes use the independent public-test oracle; no production
texture helper or encoder is imported or used as its own verifier.
"""
import argparse
import datetime
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import sys
import traceback

import numpy as np
import PIL
from PIL import Image, features

ROOT = Path(__file__).resolve().parents[3]
ROLES = ('diffuse','height','normalX','normalY','normalZ')
NAMES = ('church1','maya1_9','city8_2','rock3_2','wwall1_1')
EXPORTS = ROOT/'docs/quake/textures/codec-transition-actual-exports.json'
PROTECTED = ROOT/'docs/quake/textures/codec-transition-protected.json'
ART = ROOT/'docs/quake/textures/parallel-020/root-independent-art-before-codec.json'
ORACLE_PATH = ROOT/'tests/hexen2_texture_tiers_test.py'
PROOFS = {
    'church1':'docs/quake/textures/batch-001-native-source-proof.json',
    'maya1_9':'docs/quake/textures/batch-001-native-source-proof.json',
    'city8_2':'docs/quake/textures/parallel-020/city8_2/native-proof.json',
    'rock3_2':'docs/quake/textures/parallel-020/rock3_2/native-source-diagnostic.json',
    'wwall1_1':'docs/quake/textures/parallel-020/wwall1_1/native-source-proof-v2.json'}
sha = lambda b:hashlib.sha256(b).hexdigest()


def need(ok,message):
    if not ok:raise AssertionError(message)


def path(value):
    p=(ROOT/value).resolve();p.relative_to(ROOT);return p


def binding(p,data=None):
    p=Path(p).resolve();p.relative_to(ROOT)
    return {'file':str(p.relative_to(ROOT)),'sha256':sha(p.read_bytes()if data is None else data)}


def riff(data):
    need(data[:4]==b'RIFF'and data[8:12]==b'WEBP','Malformed WebP RIFF')
    need(int.from_bytes(data[4:8],'little')+8==len(data),'RIFF byte count differs')
    at,kinds=12,[]
    while at<len(data):
        need(at+8<=len(data),'Truncated chunk header')
        n=int.from_bytes(data[at+4:at+8],'little')
        need(at+8+n<=len(data),'Truncated chunk')
        kinds.append(data[at:at+4]);at+=8+n+n%2
    need(at==len(data),'RIFF padding differs')
    return kinds


def encode(image,lossless):
    stream=io.BytesIO();image.save(stream,'WEBP',quality=92,lossless=lossless,method=6)
    return stream.getvalue()


def angle(first,second):
    a=np.degrees(np.arccos(np.clip(np.sum(first*second,axis=2),-1,1)))
    return {'mean':float(a.mean()),'p99':float(np.percentile(a,99)),'maximum':float(a.max())}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report',type=Path,required=True)
    args=parser.parse_args()
    need(not args.report.exists()and not args.report.is_symlink(),'Never overwrite retained verification evidence')
    watched={}
    def read(p):
        p=Path(p).resolve();p.relative_to(ROOT);b=p.read_bytes()
        need(p not in watched or watched[p]==sha(b),'Read input changed')
        watched[p]=sha(b);return b
    def load(p):return json.loads(read(p))
    def check_record(row,expected=None):
        p=path(row['file']);need(expected is None or p==expected,'Record path mismatch')
        b=read(p);need(sha(b)==row['sha256'],'Record bytes differ: '+str(p));return p,b
    report={'schemaVersion':1,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'verdict':'HOLD verification incomplete','workspace':str(ROOT),'scope':'Exactly five retained opaque WORLD codec-migration packages, 10 unchanged Q92 diffuse files and40 lossless data files; no material/edge/runtime/owner/release acceptance.',
        'verifier':binding(__file__),'independentOracle':binding(ORACLE_PATH),
        'command':'/usr/bin/python3 docs/quake/textures/codec-transition-actual-public-verify.py --report NEW_REPORT_JSON',
        'environment':{'python':sys.version,'executable':sys.executable,'Pillow':PIL.__version__,'NumPy':np.__version__,'WebP':features.version('webp')},
        'counts':{'materials':0,'newFiles':0,'unchangedDiffuseFiles':0,'exactLosslessDataFiles':0},'items':[],
        'limits':['Native identity rebinds retained original/raw/prompt hashes and prior proof identities; no new PAK/member audit or full-native-family completeness claim.',
                  'Generation count and historical provider provenance remain retained metadata; this read-only verifier makes no generation call or transcript-authentication claim.',
                  'Master custody is checked against unchanged historical bytes; the prior source/master authoring proofs retain their recorded scope.',
                  'A codec PASS does not clear existing art, seam, physical relief or native semantic holds. Masks/alpha/glass/emission/sky/liquid/animation families are not qualified.',
                  'New mixed-codec batch/review HTML and panel replay are a separate subsequent supplement.']}
    try:
        read(Path(__file__));read(ORACLE_PATH)
        spec=importlib.util.spec_from_file_location('independent_actual_quake_oracle',ORACLE_PATH)
        oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
        exports=load(EXPORTS);protected=load(PROTECTED);art=load(ART)
        report.update(exportRecord=binding(EXPORTS),protectedCustody=binding(PROTECTED),retainedArtHolds=binding(ART))
        need(tuple(x['name']for x in exports['exports'])==NAMES,'Unexpected material scope/order')
        need(len(protected['files'])==217,'Protected custody scope changed')
        for rec in protected['files']:check_record(rec)
        report['protectedCustody'].update(filesChecked=217,allByteHashesUnchanged=True)
        holds={x['texture']:x['artVerdict']for x in art['textures']}
        need(holds=={n:'HOLD'for n in NAMES[2:]},'Recorded three art HOLDs changed')
        report['retainedArtHolds']['perMaterial']=holds
        policy={role:({'lossless':False,'quality':92,'method':6}if role=='diffuse'else
                      {'lossless':True,'compressionEffort':92,'method':6})for role in ROLES}
        for export in exports['exports']:
            name=export['name'];newp=path(export['newManifest']);oldp=path(export['oldManifest']);mp=path(export['masterPackage'])
            new,old,master=load(newp),load(oldp),load(mp)
            need(sha(read(newp))==export['newManifestSha256'],'Final export binding differs')
            need(new['schemaVersion']==2 and old['schemaVersion']==1 and new['family']=='quake','Wrong manifest schema/family')
            need(new['defaultTier']==old['defaultTier']=='Mid'and new['encodingByRole']==policy,'Wrong per-role policy/default')
            need(new['inputs']==old['inputs']and new['Low']==old['Low'],'Migration changed authoring input or Low')
            need((new['strength'],new['cap'])==(old['strength'],old['cap']),'Normal parameters changed')
            nativep,native_bytes=check_record(new['inputs']['original'],path(export['original']))
            rgbp,rgbbytes=check_record(new['inputs']['master'],(mp.parent/master['color']['file']).resolve())
            scalarp,scalarbytes=check_record(new['inputs']['heightMaster'],(mp.parent/master['height']['file']).resolve())
            need(master['inputs']['original']['file']==str(nativep)and master['inputs']['original']['sha256']==sha(native_bytes),'Master/native binding differs')
            need(master['color']['sha256']==sha(rgbbytes)and master['height']['sha256']==sha(scalarbytes),'Canonical master bytes changed')
            need(master['generationCount']==1 and master['height']['authoredOnce']is True
                 and master['height']['quantizedTo8Bit']is False,'Master precision/custody declaration differs')
            for input_row in master['inputs'].values():check_record(input_row)
            for tool in master['tools'].values():check_record(tool)
            tools={'adapter':ROOT/'tools/texture_sheets/derive_quake_texture_tiers.py',
                   'sharedDeriver':ROOT/'tools/texture_sheets/derive_texture_tiers.py','normalMath':ROOT/'tools/craft_normals.py'}
            need(set(new['tools'])==set(tools),'Unexpected export producer identities')
            for role,expected in tools.items():check_record(new['tools'][role],expected)
            need(old['tools']['deriverSha256']==new['tools']['sharedDeriver']['sha256']
                 and old['tools']['normalMathSha256']==new['tools']['normalMath']['sha256'],'Legacy producer custody changed')
            for key in ('Pillow','NumPy','WebP'):need(new['environment'][key]==report['environment'][key],'Codec environment differs')
            with Image.open(io.BytesIO(native_bytes))as im:
                need(im.format=='PNG'and np.asarray(im.convert('RGBA'))[:,:,3].min()==255,'Native format/transparency differs')
                native=im.convert('RGB').copy();rgba=im.convert('RGBA').tobytes()
            with Image.open(io.BytesIO(rgbbytes))as im:
                need(im.format=='PNG'and im.mode=='RGB','Canonical RGB is not lossless RGB PNG');rgb=im.copy()
            scalar=np.load(io.BytesIO(scalarbytes),allow_pickle=False)
            need(scalar.dtype in(np.dtype('float32'),np.dtype('float64'))and scalar.shape==(rgb.height,rgb.width)
                 and np.isfinite(scalar).all()and scalar.min()>=0 and scalar.max()<=1,'Invalid full-precision scalar')
            need(list(native.size)==master['nativeDimensions']and list(rgb.size)==master['masterDimensions']
                 and rgb.width>=native.width*8 and rgb.height>=native.height*8
                 and rgb.width*native.height==rgb.height*native.width,'Master adequacy/aspect differs')
            proofp=path(PROOFS[name]);proof=load(proofp)
            proofrows=[x for x in proof['items']if x['name']==name]
            need(len(proofrows)==1,'Native proof row scope differs');proofrow=proofrows[0]
            need(path(proofrow['original'])==nativep and proofrow['originalSha256']==sha(native_bytes)
                 and proofrow['rgbaSha256']==sha(rgba),'Current native differs from retained native proof')
            for role,pkey,hkey in [('generated','raw','rawSha256'),('prompt','prompt','promptSha256')]:
                need(path(proofrow[pkey])==path(master['inputs'][role]['file'])and proofrow[hkey]==master['inputs'][role]['sha256'],
                     'Retained raw/prompt proof differs')
            nativeid=proofrow['id']
            proofbindings=[binding(proofp)]
            if name=='rock3_2':
                selectedp=ROOT/'docs/quake/textures/parallel-020/rock3_2/native-selected-source-proof.json';selected=load(selectedp)
                need(selected['identity']['rgbaSha256']==sha(rgba),'Selected used rock identity differs')
                nativeid=selected['nativeIdentity'];proofbindings.append(binding(selectedp))
                need(sha(json.dumps(selected['identity'],sort_keys=True,separators=(',',':')).encode())==nativeid,'Selected native identity digest differs')
            need(set(new['tiers'])==set(old['tiers'])=={'Mid','High'},'Tier set differs')
            actual_files={'manifest.json'};item={'name':name,'nativeIdentity':nativeid,'nativeProofs':proofbindings,
                'original':binding(nativep),'masterPackage':binding(mp),'rgbMaster':binding(rgbp),'scalarMaster':binding(scalarp),
                'legacyManifest':binding(oldp),'newManifest':binding(newp),'masterProducerPinsUnchanged':True,
                'artStatus':'HOLD unchanged; codec verification cannot clear seam/relief finding'if name in holds else'Affected current decoded-data/lighting review pending coordinator; prior colour/source evidence retained',
                'tiers':{}}
            for tier,factor in [('Mid',4),('High',8)]:
                row,legacy=new['tiers'][tier],old['tiers'][tier];size=(native.width*factor,native.height*factor)
                need(row['factor']==legacy['factor']==factor and row['dimensions']==legacy['dimensions']==list(size),'Wrong tier dimensions')
                need(set(row['outputs'])==set(legacy['outputs'])==set(ROLES),'Wrong output role set')
                h=oracle.float_box(scalar,size)
                bh,bw=scalar.shape[0]//size[1],scalar.shape[1]//size[0]
                need((scalar.shape[1]%size[0],scalar.shape[0]%size[1])==(0,0),'Actual independent integer footprint assumption differs')
                footprint=scalar.astype('float64').reshape(size[1],bh,size[0],bw).mean(axis=(1,3))
                np.testing.assert_allclose(h,footprint,rtol=0,atol=8e-8)
                normal=oracle.cyclic_normals(h,new['strength'],new['cap'])
                packed=np.round(np.clip(normal*.5+.5,0,1)*255).astype('uint8')
                intended={'diffuse':oracle.periodic_rgb(rgb,size),'height':Image.fromarray(np.round(h*255).astype('uint8'))}
                intended.update({role:Image.fromarray(packed[:,:,c])for c,role in enumerate(ROLES[2:])})
                decoded={};out=[]
                for role in ROLES:
                    rec,oldrec=row['outputs'][role],legacy['outputs'][role]
                    p=(newp.parent/rec['file']).resolve();oldfile=(oldp.parent/oldrec['file']).resolve()
                    need(p.parent==newp.parent and oldfile.parent==oldp.parent,'Output path escaped package')
                    payload,oldbytes=read(p),read(oldfile);actual_files.add(p.name)
                    need(sha(payload)==rec['sha256']and len(payload)==rec['bytes']and rec['dimensions']==list(size),'Output byte/dimension binding differs')
                    need(sha(oldbytes)==oldrec['sha256']and len(oldbytes)==oldrec['bytes'],'Legacy output bytes changed')
                    need(all(rec[k]==v for k,v in policy[role].items()),'Output role metadata differs')
                    kinds=riff(payload);oldkinds=riff(oldbytes)
                    need(b'VP8 'in oldkinds and b'VP8L'not in oldkinds,'Historical map is not its declared lossy codec')
                    lossless=role!='diffuse';need((b'VP8L'if lossless else b'VP8 ')in kinds
                        and(b'VP8 'if lossless else b'VP8L')not in kinds,'Actual role codec differs')
                    expected=encode(intended[role],lossless)
                    need(payload==expected,'Independent direct-master encoder byte mismatch '+name+'/'+tier+'/'+role)
                    image=Image.open(io.BytesIO(payload)).convert('RGB');need(image.size==size,'Decoded dimensions differ');decoded[role]=image
                    layout='L'if lossless else'RGB';need(rec['pixelLayout']==layout and rec['bitDepth']==8,'Pixel precision/layout differs')
                    need(rec['intendedPixelSha256']==sha(intended[role].tobytes())and rec['decodedPixelSha256']==sha(image.convert(layout).tobytes()),'Intended/decoded channel hash differs')
                    err=np.abs(np.asarray(image,dtype=int)-np.asarray(intended[role].convert('RGB'),dtype=int))
                    integer={'mismatchCount':int(np.count_nonzero(err)),'meanAbsoluteError':float(err.mean()),'maximum':int(err.max())}
                    need(integer==rec['integerCompression'],'Integer compression diagnostic differs')
                    need(rec['sourceMaster']==('master'if role=='diffuse'else'heightMaster'),'Wrong source-master role')
                    if lossless:
                        need(integer=={'mismatchCount':0,'meanAbsoluteError':0.0,'maximum':0},'Lossless map changed intended channels')
                        report['counts']['exactLosslessDataFiles']+=1
                    else:
                        need(payload==oldbytes,'Diffuse changed across codec migration')
                        report['counts']['unchangedDiffuseFiles']+=1
                    oldimage=np.asarray(Image.open(io.BytesIO(oldbytes)).convert('RGB'),dtype=int)
                    out.append({'role':role,**binding(p),'bytes':len(payload),'dimensions':list(size),
                        'actualCodec':'VP8L'if lossless else'VP8','exactIndependentEncoderBytes':True,
                        'intendedPixelSha256':rec['intendedPixelSha256'],'decodedPixelSha256':rec['decodedPixelSha256'],
                        'integerCompression':integer,'legacyDecodedMismatchCount':int(np.count_nonzero(oldimage-np.asarray(intended[role].convert('RGB'),dtype=int))),
                        'legacyEncodedBytesUnchanged':True,'diffuseBytesIdenticalToLegacy':not lossless})
                    report['counts']['newFiles']+=1
                quantized=np.asarray(intended['height'],dtype=float)/255
                quant_error=np.abs(quantized-h)
                need(math.isclose(row['heightQuantizationCompressionMAE'],float(quant_error.mean()),rel_tol=0,abs_tol=1e-15),'Height quantization diagnostic differs')
                need(row['quantization']['bitDepth']==8 and row['quantization']['rounding']=='NumPy ties-to-even','Wrong quantization contract')
                vectors=np.stack([np.asarray(decoded[role],dtype=float)[:,:,0]for role in ROLES[2:]],2)/127.5-1
                vectors/=np.maximum(np.linalg.norm(vectors,axis=2,keepdims=True),1e-12)
                height_normal=oracle.cyclic_normals(quantized,new['strength'],new['cap'])
                diagnostics={key:angle(first,second)for key,first,second in[
                    ('authoredNormalVsDecodedXYZDegrees',normal,vectors),
                    ('authoredNormalVsDecodedHeightDegrees',normal,height_normal),
                    ('decodedHeightNormalVsDecodedXYZDegrees',height_normal,vectors)]}
                for key,metrics in diagnostics.items():
                    for metric,value in metrics.items():need(math.isclose(row[key][metric],value,rel_tol=0,abs_tol=1e-10),'Normal diagnostic differs')
                need({x['divisor']for x in row['distanceChecks']}=={2,4},'Missing native distance check')
                for check in row['distanceChecks']:
                    dims=(native.width//check['divisor'],native.height//check['divisor'])
                    error=np.abs(np.asarray(native.resize(dims,Image.Resampling.BOX),dtype=float)
                        -np.asarray(decoded['diffuse'].resize(dims,Image.Resampling.BOX),dtype=float))
                    need(check['dimensions']==list(dims)and check['meanAbsoluteError']==float(error.mean())and check['maximum']==float(error.max()),'Distance diagnostic differs')
                item['tiers'][tier]={'factor':factor,'dimensions':list(size),'outputs':out,
                    'heightFloatTo8Quantization':{'meanAbsoluteError':float(quant_error.mean()),'maximum':float(quant_error.max())},
                    'dataIntegerCompressionError':0,'normalAngleDiagnostics':diagnostics,
                    'independentIntegerFootprintMaximumDifference':float(np.max(np.abs(h-footprint)))}
            need({p.name for p in newp.parent.iterdir()if p.is_file()}==actual_files,'Unexpected or partial package file set')
            report['items'].append(item);report['counts']['materials']+=1
            print(name+': 10 maps independently verified; diffuse unchanged, data exact',flush=True)
        need(report['counts']=={'materials':5,'newFiles':50,'unchangedDiffuseFiles':10,'exactLosslessDataFiles':40},'Final output count differs')
        for p,digest in watched.items():need(sha(p.read_bytes())==digest,'Source/evidence changed during verification: '+str(p))
        report['watchedInputs']={'files':len(watched),'allByteHashesUnchanged':True}
        report['verdict']='PASS bounded five-package actual codec/source custody verification; three art HOLDs unchanged'
    except Exception as error:
        report['verdict']='HOLD actual verification failed';report['failure']={'type':type(error).__name__,'message':str(error)}
        traceback.print_exc()
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    with args.report.open('x')as file:file.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'verdict':report['verdict'],'counts':report['counts'],'report':str(args.report)}))
    return 0 if report['verdict'].startswith('PASS')else 1


if __name__=='__main__':
    raise SystemExit(main())
