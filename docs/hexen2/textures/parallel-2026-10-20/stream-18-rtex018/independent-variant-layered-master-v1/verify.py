"""Independent two-variant layered scalar and unchanged public CLI replay."""
from pathlib import Path
import datetime, hashlib, io, json, math, os, subprocess, tempfile
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[6]
DOC = Path(__file__).resolve().parent
STREAM = DOC.parent
BASE = ROOT / 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-18-rtex018'
ID = '7e009202100d48cda293f836a437e30d54c8d5a28ab7d190892a9c3683e397b6'
EXPECTED = {'woodland-abbey-ruin': 'd3dea7770acc641b7bd1739be438f0956c3a74c346131ba4ac956724709271d6',
            'forest-stone-shrine': '32f15a798d8ec79974a18b2d639aeabb8bc117eb03d15c1b8c1ea29a81bf9468'}
watched = {}
sha = lambda b: hashlib.sha256(b).hexdigest()

def read(path):
    path = Path(path)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    data = path.read_bytes()
    assert path not in watched or watched[path] == data, str(path)
    watched[path] = data
    return data

def load(path): return json.loads(read(path))

def witness(path):
    path = Path(path)
    path = (path if path.is_absolute() else ROOT / path).resolve()
    return {'file': str(path.relative_to(ROOT)) if ROOT in path.parents else str(path), 'sha256': sha(read(path))}

def refs(value):
    if isinstance(value, dict):
        if 'file' in value and 'sha256' in value: assert sha(read(value['file'])) == value['sha256'], value['file']
        for v in value.values(): refs(v)
    elif isinstance(value, list):
        for v in value: refs(v)

def main():
    output = DOC / 'proof-v1.json'
    assert not output.exists()
    report = {'schemaVersion': 1, 'reviewer': '/root/repair_skill_forward_check',
              'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'verdict': 'HOLD',
              'scope': 'Own-source actual layered RGB/float and public CLI reproduction for two variants; actual physical ART separate',
              'materials': [], 'publicCLI': [], 'cleanup': []}
    try:
        reference = STREAM / 'independent-baseline-layered-master-v2/verify-v1.py'
        report['independentBaselineVerifierReference'] = witness(reference)
        plan = load(STREAM / 'variant-layered-plan-v1/plan.json')
        refs(plan)
        correspondence = load(plan['actualSourceGeometryCorrespondence']['file'])
        assert correspondence['verdict'].startswith('PASS')
        previous = load(STREAM / 'independent-variant-source-master-v1/source-master-proof-v1.json')
        assert len(previous['inputs']) == 68
        refs(previous['inputs'])
        for item in plan['items']:
            key = item['artVariantID']
            package = BASE / 'art-variants' / key / 'masters/layered-v1/master.json'
            master = load(package)
            assert sha(read(package)) == EXPECTED[key]
            recipe_path = ROOT / item['recipe']['file']
            recipe = load(recipe_path)
            initial_path = ROOT / recipe['sourceMasterPackage']
            initial = load(initial_path)
            assert sha(read(initial_path)) == recipe['sourceMasterPackageSha256']
            source_proof = load(recipe['sourceVerification']['file'])
            refs(recipe['sourceVerification'])
            assert source_proof['verdict'].startswith('PASS') and source_proof['artVariantID'] == key
            row, = [x for x in source_proof['materials'] if x['nativeIdentity'] == ID]
            assert row['masterPackage'] == witness(initial_path) and row['artVariantID'] == key
            refs(source_proof['currentInputCustody']['inputs'])
            selected = load(row['immutableSelectedSource']['file'])
            refs(selected)
            assert selected['modelCalls'] == {'originalGeneration': 1, 'edits': 3, 'total': 4}
            assert selected['selectedSourceAncestryCalls'] == {'originalGeneration': 1, 'edits': 2, 'total': 3}
            assert master['name'] == recipe['name'] == initial['name'] == 'rtex018'
            assert master['edition'] == recipe['edition'] == initial['edition'] == 'base'
            assert master['generationCount'] == 1 and master['nativeDimensions'] == [64, 256]
            assert master['masterDimensions'] == [512, 2048]
            assert master['height']['authoringPolicy'] == 'layered-veneer'
            assert master['height']['dtype'] == 'float32' and master['height']['quantizedTo8Bit'] is False
            refs(master['inputs']); refs(master['tools'])
            assert master['masterRevision']['replacesUnqualifiedPackageSha256'] == recipe['sourceMasterPackageSha256']
            assert master['masterRevision']['previousHeightSha256'] == initial['height']['sha256']
            assert master['masterRevision']['RGBUnchanged'] and master['masterRevision']['notAnotherGeneration']
            assert master['layeredRelief']['recipe'] == recipe
            assert master['layeredRelief']['recipeSha256'] == sha(read(recipe_path))
            assert read(package.parent / 'color.png') == read(initial_path.parent / 'color.png')
            assert sha(read(package.parent / 'color.png')) == recipe['authoringDiffuseSha256'] == master['color']['sha256']
            layer = recipe['layering']
            assert layer == load(STREAM / 'baseline-layered-plan-v3/layered-recipe-v3.json')['layering']
            assert [layer[k] for k in ('facingHeight','brickHeight','chipFloor','microAmplitude','bevelPixels')] == [.52,.5,.505,0,.5]
            assert len(layer['brickRegions']) == 49 and layer['referenceSize'] == [64,256]
            mi = Image.new('L', (512,2048)); draw = ImageDraw.Draw(mi)
            for reg in layer['brickRegions']:
                for dy in (-2048,0,2048):
                    for dx in (-512,0,512): draw.polygon([(x*8+dx,y*8+dy) for x,y in reg['polygon']], fill=255)
            mask = np.asarray(mi,dtype=float)/255
            assert np.count_nonzero(mask) == 595545
            assert np.array_equal(np.uint8(mask*255), np.asarray(Image.open(STREAM / 'baseline-layered-plan-v3/final49-pane-mask-v3.png')))
            sigma = layer['bevelPixels']*math.sqrt(mask.size)/256
            assert sigma == master['layeredRelief']['bevelSigmaMasterPixels'] == 2
            freq = np.fft.fftfreq(2048)[:,None]**2 + np.fft.rfftfreq(512)[None,:]**2
            blurred = np.fft.irfft2(np.fft.rfft2(mask)*np.exp(-2*np.pi**2*sigma**2*freq), s=mask.shape)
            facing = .52-(.52-.505)*np.minimum(blurred*2,1)
            height = np.where(mask>.5,.5,facing).astype('float32')
            buffer = io.BytesIO(); np.save(buffer,height,allow_pickle=False)
            assert buffer.getvalue() == read(package.parent / 'height.npy')
            assert sha(buffer.getvalue()) == master['height']['sha256'] == 'e899c58d8faac4c077c0dda9441e3a8e448462ee5a9540f36b5b66b4321ba754'
            assert np.unique(height[mask>.5]).tolist() == [.5] and height[mask>.5].max() < height[mask<=.5].min()
            diagnostics = load(STREAM / 'independent-variant-pane-correspondence-v2/source-correspondence-diagnostics-v3.json')
            points = next(x for x in diagnostics['materials'] if x['artVariantID'] == key)['contextPoints']
            samples = []
            for sample in points:
                x,y = sample['masterXY']; assert bool(mask[y,x]) == sample['expectedPane']
                samples.append({'label':sample['label'],'masterXY':[x,y],'sourceClassifiedPane':sample['expectedPane'],
                                'actualHeightPoint':float(height[y,x]),'samplingScope':'Point only; interface patches may be mixed.'})
            actual = load(STREAM / 'variant-layered-plan-v1' / (key+'-actual.json'))
            refs(actual); assert actual['exitCode'] == 0 and not read(actual['stderr']['file'])
            command = list(actual['argv'])
            with tempfile.TemporaryDirectory(prefix='quaked-rtex018-layered-'+key+'-',dir='/private/tmp') as work:
                temporary = Path(work); command[command.index('--output')+1] = str(temporary/'master')
                run = subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=180,
                                     env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'})
                cli = {'artVariantID':key,'argv':command,'exitCode':run.returncode,'stdout':run.stdout,'stderr':run.stderr}
                report['publicCLI'].append(cli); assert run.returncode == 0, run.stderr
                for name in ('color.png','height.npy','master.json'): assert (temporary/'master'/name).read_bytes() == read(package.parent/name),name
                cli['allThreeFilesByteExact'] = True
            assert not temporary.exists(); report['cleanup'].append({'privateReplay':str(temporary),'removed':True})
            report['materials'].append({'nativeIdentity':ID,'name':'rtex018','edition':'base','artVariantID':key,
                'masterPackage':witness(package),'masterColor':witness(package.parent/'color.png'),'masterHeight':witness(package.parent/'height.npy'),
                'sourceMasterPackage':witness(initial_path),'sourceVerification':witness(recipe['sourceVerification']['file']),
                'immutableSelection':row['immutableSelectedSource'],'modelCalls':selected['modelCalls'],
                'selectedSourceAncestryCalls':selected['selectedSourceAncestryCalls'],'sourceClassifiedPointHeights':samples,
                'independentMath':{'RGBUnchanged':True,'floatNPYBytesExact':True,'panePixels':595545,'paneHeight':.5,
                                   'sigmaMasterPixels':sigma,'facingRange':[float(height[mask<=.5].min()),float(height[mask<=.5].max())]},
                'currentReliefArtAccepted':False})
        assert all(p.read_bytes()==b for p,b in watched.items())
        report.update(verdict='PASS two actual own-source layered RGB/float and unchanged public CLI three-file replays; physical ART and tiers separate',
            inputsStable=True,old68SourceProofInputsExact=True,
            identicalScalarExplanation='Independently recomputed from each own recipe; same49 mask/planes and microAmplitude0 imply equal scalar bytes. No baseline height was read as a donor or copied.',
            qualificationBoundary='Numerical and public CLI reproduction only; inspect each own actual RGB/height/XYZ/opposed lights and pane/came contacts before any alternate tier.',
            verifier=witness(__file__))
        report['inputs'] = [witness(p) for p in sorted(watched)]
    except Exception as error:
        report.update(verdict='HOLD layered verifier attempt failed; preserve receipt',error=repr(error)); raise
    finally:
        report['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with output.open('x') as file: file.write(json.dumps(report,indent=2)+'\n')
        print(json.dumps({'proof':str(output.relative_to(ROOT)),'sha256':sha(output.read_bytes()),'verdict':report['verdict']}))

if __name__ == '__main__': main()
