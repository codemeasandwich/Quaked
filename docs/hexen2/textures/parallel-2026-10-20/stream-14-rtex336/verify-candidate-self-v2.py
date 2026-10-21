"""Actual author source/float/tier/preview replay; independent acceptance separate."""
import ast
import datetime
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tempfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[5]
DOC = Path(__file__).resolve().parent
BASE = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-14-rtex336'
MASTER = BASE/'masters-layered/rtex336'
TIER = BASE/'tiers/rtex336'
OUT = DOC/'candidate-self-replay-v2.json'
sha = lambda data: hashlib.sha256(data).hexdigest()


def witness(path):
    return {'file': str(path.relative_to(ROOT)), 'sha256': sha(path.read_bytes())}


def save(path, image):
    assert path.is_file()
    buffer = io.BytesIO();image.save(buffer,'PNG')
    assert path.read_bytes() == buffer.getvalue(),str(path)
    return witness(path)


def functions(path, names, context):
    module = ast.parse(path.read_bytes())
    nodes = [node for node in module.body if isinstance(node, ast.FunctionDef) and node.name in names]
    assert {node.name for node in nodes} == set(names)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), 'exec'), context)


def main():
    assert not OUT.exists()
    batch = json.loads((BASE/'batch.json').read_bytes())
    item, = batch['items']
    journal, = json.loads((BASE/'selection.json').read_bytes())['items']
    mp = json.loads((MASTER/'master.json').read_bytes())
    manifest = json.loads((TIER/'manifest.json').read_bytes())
    assert journal['generationCount'] == item['generationCount'] == 1
    assert journal['generationState'] == 'generated-retained'
    original = Image.open(ROOT/item['original']).convert('RGB')
    rgb = Image.open(MASTER/'color.png').convert('RGB')
    scalar = np.load(MASTER/'height.npy', allow_pickle=False)
    assert scalar.dtype == np.float32 and scalar.shape == (1024,512) and np.isfinite(scalar).all()
    assert (ROOT/journal['generated']).read_bytes() == Path(journal['builtInOutput']).read_bytes()
    watched = {}
    for directory in (BASE,):
        for path in directory.rglob('*'):
            if path.is_file():watched[path] = path.read_bytes()
    for path in [DOC/'root-plan-review.json', DOC/'root-shallow-masonry-plan-review-v1.json', DOC/'independent-source-master/source-master-proof-v1.json', ROOT/'tools/texture_sheets/prepare_layered_texture_master.py', ROOT/'tools/texture_sheets/derive_texture_tiers.py', ROOT/'tools/texture_sheets/build_texture_batch_review.py', ROOT/'tools/craft_normals.py', Path(__file__)]:
        watched[path] = path.read_bytes()
    oracle_path = ROOT/'tests/hexen2_texture_tiers_test.py'
    watched[oracle_path] = oracle_path.read_bytes()
    context = {'np':np, 'Image':Image, 'io':io}
    functions(oracle_path, {'q92','periodic_rgb','float_box','cyclic_normals','vp8_only'}, context)
    views = DOC/'decoded-art'
    views.mkdir(exist_ok=True)
    classifications = json.loads((DOC/'layered-pre-tier-check.json').read_bytes())['samples']
    role_names = ('diffuse','height','normalX','normalY','normalZ')
    tier_reports, evidence = {}, []
    for name, factor in [('Mid',4),('High',8)]:
        n = 64*factor
        ny = 128*factor
        row = manifest['tiers'][name]
        height = context['float_box'](scalar,(n,ny))
        normals = context['cyclic_normals'](height, manifest['strength'], manifest['cap'])
        packed = np.rint(np.clip(normals*.5+.5,0,1)*255).astype('uint8')
        images = {'diffuse':context['periodic_rgb'](rgb,(n,ny)), 'height':Image.fromarray(np.rint(height*255).astype('uint8'))}
        images.update({role:Image.fromarray(packed[:,:,c]) for c,role in enumerate(role_names[2:])})
        decoded, maps = {}, []
        for role, image in images.items():
            output = row['outputs'][role]
            path = TIER/output['file']
            data = path.read_bytes()
            assert data == context['q92'](image) and sha(data) == output['sha256']
            assert (output['quality'],output['method'],output['lossless']) == (92,6,False)
            context['vp8_only'](data)
            decoded[role] = Image.open(io.BytesIO(data)).convert('RGB')
            assert decoded[role].size == (n,ny)
            maps.append({'role':role, **witness(path)})
        samples = []
        dh = np.asarray(decoded['height'],float)[:,:,0]/255
        for sample in classifications:
            x,y = sample['masterPixel']
            cx,cy = int(x*factor/8),int(y*factor/8)
            radius = max(1,round(3*factor/8))
            ys = (np.arange(cy-radius,cy+radius+1)%ny)[:,None]
            xs = (np.arange(cx-radius,cx+radius+1)%n)[None,:]
            v = dh[ys,xs]
            samples.append({'label':sample['label'],'sourceClass':sample['sourceClass'],'tierPixel':[cx,cy],'radius':radius,'decodedCenter':float(dh[cy,cx]),'decodedMean':float(v.mean()),'decodedMedian':float(np.median(v)),'decodedRange':[float(v.min()),float(v.max())],'semanticLimit':'mixed contact/interface window; not pure material' if sample['label'] in ('H1','H2','H3','V1','V3','X2','Y','I1','I2','IX','IY') else 'relative face/stain sample, not measured depth'})
        by = {sample['label']:sample for sample in samples}
        assert min(by[key]['decodedMean'] for key in ('A','B','C','D','E','F','S1','S2','S3')) > max(by[key]['decodedCenter'] for key in ('H1','H2','H3','V1','V3','X2','Y'))
        array = np.asarray(decoded['diffuse'])
        vector = np.stack([np.asarray(decoded[role],float)[:,:,0] for role in role_names[2:]],2)/127.5-1
        vector /= np.maximum(np.linalg.norm(vector,axis=2,keepdims=True),1e-12)
        xyz = np.rint(np.clip((vector*.5+.5)*255,0,255)).astype('uint8')
        neutral = Image.new('RGB',(2*n,ny))
        textured = Image.new('RGB',(2*n,ny))
        for index, sign in enumerate((1,-1)):
            light = np.array([sign*.6,sign*.3,.75]);light /= np.linalg.norm(light)
            gain = .35+.65*np.maximum(0,np.einsum('ijk,k->ij',vector,light))
            neutral.paste(Image.fromarray(np.rint(180*gain).astype('uint8')).convert('RGB'),(index*n,0))
            textured.paste(Image.fromarray(np.rint(np.clip(array*gain[:,:,None],0,255)).astype('uint8')),(index*n,0))
        prefix = name.lower()
        span = n//8
        evidence += [save(views/(prefix+'-diffuse.png'),decoded['diffuse']),save(views/(prefix+'-height.png'),decoded['height']),save(views/(prefix+'-XYZ.png'),Image.fromarray(xyz)),save(views/(prefix+'-neutral-opposed.png'),neutral),save(views/(prefix+'-textured-opposed.png'),textured),save(views/(prefix+'-repeat.png'),Image.fromarray(np.tile(array,(2,2,1)))),save(views/(prefix+'-X-full.png'),Image.fromarray(np.concatenate([array[:,-span:],array[:,:span]],1))),save(views/(prefix+'-Y-full.png'),Image.fromarray(np.concatenate([array[-span:],array[:span]],0))),save(views/(prefix+'-corner.png'),Image.fromarray(np.roll(np.roll(array,span,axis=0),span,axis=1)[:span*2,:span*2]))]
        distances = []
        for divisor in (2,4):
            size = 64//divisor
            sy = 128//divisor
            a,b = original.resize((size,sy),Image.Resampling.BOX),decoded['diffuse'].resize((size,sy),Image.Resampling.BOX)
            diff = np.abs(np.asarray(a,float)-np.asarray(b,float))
            entry = {'divisor':divisor,'dimensions':[size,sy],'meanAbsoluteError':float(diff.mean()),'maximum':float(diff.max())}
            assert entry in row['distanceChecks'];distances.append(entry)
            panel = Image.new('RGB',(size*2,sy));panel.paste(a,(0,0));panel.paste(b,(size,0))
            evidence.append(save(views/(prefix+'-BOX'+str(size)+'.png'),panel))
        tier_reports[name] = {'dimensions':[n,ny],'maps':maps,'allFiveDirectMasterQ92Method6BytesExact':True,'distanceChecks':distances,'decodedSourceSamples':samples,'normalDiagnostics':{key:value for key,value in row.items() if key.endswith('Degrees') or key == 'heightQuantizationCompressionMAE'}}
    commands, previews = [], []
    with tempfile.TemporaryDirectory(prefix='quaked-rtex336-self-',dir='/private/tmp') as td:
        temp = Path(td)
        def run(arguments):
            argv = ['/usr/bin/python3', *map(str,arguments)]
            process = subprocess.run(argv,cwd=ROOT,capture_output=True,text=True,timeout=120)
            commands.append({'command':argv,'exitCode':process.returncode,'stdout':process.stdout,'stderr':process.stderr})
            assert process.returncode == 0,process.stderr
        run([ROOT/'tools/texture_sheets/prepare_layered_texture_master.py','--recipe',BASE/'relief/rtex336-shallow-masonry-v1.json','--output',temp/'master'])
        for file in ('color.png','height.npy','master.json'):
            assert (temp/'master'/file).read_bytes() == (MASTER/file).read_bytes()
        run([ROOT/'tools/texture_sheets/derive_texture_tiers.py','--original',ROOT/item['original'],'--master',MASTER/'color.png','--height-master',MASTER/'height.npy','--output',temp/'tiers'])
        for tier in manifest['tiers'].values():
            for output in tier['outputs'].values():
                assert (temp/'tiers'/output['file']).read_bytes() == (TIER/output['file']).read_bytes()
        assert (temp/'tiers/manifest.json').read_bytes() == (TIER/'manifest.json').read_bytes()
        run([ROOT/'tools/texture_sheets/build_texture_batch_review.py','--batch',BASE/'batch.json','--paths-root',ROOT,'--output',temp/'review'])
        assert (temp/'review/index.html').read_bytes() == (BASE/'review/index.html').read_bytes()
        for name in ('mid-review','mid-relief','high-review','high-relief'):
            path = BASE/'review'/('rtex336-'+name+'.jpg');replay = temp/'review'/path.name
            a,b = np.asarray(Image.open(path).convert('RGB')),np.asarray(Image.open(replay).convert('RGB'))
            assert a.shape == b.shape
            if name.endswith('review'):
                boxes = {'title':(0,0,1400,32),'native':(12,32,268,544),'diffuse':(540,32,796,544),'detail':(1068,32,1324,288),'repeat':(12,570,524,1082),'half-label':(540,570,1400,595),'half-native':(540,595,636,787),'half-enhanced':(646,595,742,787),'quarter-label':(540,805,1400,830),'quarter-native':(540,830,588,926),'quarter-enhanced':(598,830,646,926)}
            else:
                size = 256
                height_size = 512
                boxes = {'top-labels':(0,0,1200,30),'bottom-labels':(0,550,1200,580),'height':(10,30,10+size,30+height_size),'XYZ':(610,30,610+size,30+height_size),'light-A':(10,580,10+size,580+height_size),'light-B':(610,580,610+size,580+height_size)}
            occupied = np.zeros(a.shape[:2],dtype=bool);panels = []
            for label,(x0,y0,x1,y1) in boxes.items():
                assert not occupied[y0:y1,x0:x1].any()
                assert np.array_equal(a[y0:y1,x0:x1],b[y0:y1,x0:x1]),name+' '+label
                occupied[y0:y1,x0:x1] = True
                panels.append({'label':label,'box':[x0,y0,x1,y1],'decodedRGBSHA256':sha(a[y0:y1,x0:x1].tobytes()),'exactReplay':True})
            changed = np.any(a != b,axis=2)
            allowed = np.zeros_like(changed);allowed[-16:,-40:] = True
            assert not np.any(allowed & occupied) and not np.any(changed & ~allowed)
            previews.append({**witness(path),'fullJPEGBytesExact':path.read_bytes() == replay.read_bytes(),'contentAndLabelsExact':True,'panels':panels,'changedPixels':int(changed.sum()),'allVarianceOnlyProvenUnused40x16Tail':True})
    assert not temp.exists()
    assert all(path.read_bytes() == data for path,data in watched.items())
    report = {'schemaVersion':1,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'verdict':'PASS author source-bound master/float/direct10map/actualCLI/staticHTML/content replay; independent final source/math/ART qualification required','scope':'Author self-check only; maintained independent tier math oracles reused without changing producers','batch':witness(BASE/'batch.json'),'masterPackage':witness(MASTER/'master.json'),'tierReceipt':witness(TIER/'manifest.json'),'generationCount':1,'rawBuiltinBytesExact':True,'tierChecks':tier_reports,'publicCLIReplay':commands,'allPublicMasterMapManifestBytesExact':True,'HTMLBytesExact':True,'all4JPEGBytesExact':all(row['fullJPEGBytesExact'] for row in previews),'previewChecks':previews,'diagnosticEvidence':evidence,'inputsStable':True,'inputs':{str(path.relative_to(ROOT)):sha(data) for path,data in watched.items()},'ownedTemporaryReplayRemoved':True,'temporaryReplay':str(temp),'browserBoundary':'Supported browser URL policy previously rejected file navigation for this campaign and forbids workaround. This texture checks static HTML and decoded content only; no browser rendering/interaction claim.','semanticLimits':['Actual second/fourth X contacts are source-visible; no upper/third X mask or invented perimeter.','All H/V/X/Y radius windows may contain soil/pebble/stone-edge interfaces; actual mask fractions retained, no pure-material claim.','Dark stains remain slight face-plane variation, not measured physical pits or broad basins.'],'verifier':witness(Path(__file__))}
    with OUT.open('x') as file:file.write(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'proof':witness(OUT),'maps':10,'previewContentPanels':sum(len(row['panels']) for row in previews),'all4JPEGBytesExact':report['all4JPEGBytesExact']}))


if __name__ == '__main__':main()
