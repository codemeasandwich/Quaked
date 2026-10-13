"""Public optional WebP92 finishing contract; all fixtures live in a temporary directory."""
from pathlib import Path
from io import BytesIO
import copy
import hashlib
import json
import sys
import tempfile
import unittest
from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/texture_sheets'))
from finish_runtime_skin import finish_runtime_skin


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode_reference(data):
    with Image.open(BytesIO(data)) as image:
        mode = 'RGBA' if 'A' in image.getbands() else 'RGB'
        output = BytesIO()
        image.convert(mode).save(output, 'WEBP', quality=92, lossless=False, method=6)
    return output.getvalue()


def decoded(data):
    with Image.open(BytesIO(data)) as image:
        return image.format, list(image.size), image.convert('RGBA').tobytes()


class RuntimeSkinFinishingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='quaked-q92-public-')
        self.work = Path(self.temp.name)
        self.output = self.work / 'output'
        self.folder = self.output / 'sample/custom'
        self.folder.mkdir(parents=True)
        self.source = self.work / 'original-source.png'
        image = Image.new('RGB', (64, 48))
        image.putdata([((x*17+y*7)%256, (x*3+y*23)%256, (x*29+y*11)%256) for y in range(48) for x in range(64)])
        image.save(self.source)
        image.save(self.folder / 'diffuse.png')
        height = Image.new('L', (64, 48));height.putdata([(x*9+y*13)%256 for y in range(48) for x in range(64)])
        height.save(self.folder / 'height.webp', 'WEBP', lossless=True)
        self.native = self.output / 'heights/sample/skin0_0.webp';self.native.parent.mkdir(parents=True)
        height.resize((16, 12)).save(self.native, 'WEBP', lossless=True)
        self.record = self.folder / 'SOURCE.json'
        self.report = {'schema':1,'model':'progs/sample.mdl','source':str(self.source),'sourceSha256':sha(self.source.read_bytes()),'factor':4,'dimensions':[64,48],
                       'files':{name:sha((self.folder/name).read_bytes()) for name in ['diffuse.png','height.webp']},
                       'nativeHeight':{'file':'heights/sample/skin0_0.webp','dimensions':[16,12],'sha256':sha(self.native.read_bytes())}}
        self.record.write_text(json.dumps(self.report))
        self.recipe = {'runtimeEncoding':{'format':'webp','quality':92}}

    def tearDown(self):
        self.temp.cleanup()

    def snapshot(self):
        return {str(p.relative_to(self.work)):p.read_bytes() for p in self.work.rglob('*') if p.is_file()}

    def test_explicit_q92_has_real_decoded_dimensions_exact_receipts_and_untouched_source(self):
        masters={name:(self.folder/name).read_bytes() for name in ['diffuse.png','height.webp']}
        native_before=self.native.read_bytes();source_before=self.source.read_bytes()
        finish_runtime_skin(self.output,'sample',self.recipe)
        report=json.loads(self.record.read_text())
        self.assertEqual(report['sourceSha256'],sha(source_before));self.assertEqual(self.source.read_bytes(),source_before)
        self.assertFalse((self.folder/'diffuse.png').exists(),'authoring master is no longer a runtime map')
        self.assertEqual(set(report['files']),{'diffuse.webp','height.webp'})
        encoding=report['runtimeEncoding'];self.assertEqual((encoding['format'],encoding['quality'],encoding['lossless']),('webp',92,False));self.assertTrue(encoding['authoringSourceUnchanged'])
        for source,target in [('diffuse.png','diffuse.webp'),('height.webp','height.webp')]:
            data=(self.folder/target).read_bytes();self.assertEqual(data,encode_reference(masters[source]),'exact requested encoder settings')
            fmt,size,pixels=decoded(data);self.assertEqual(fmt,'WEBP');self.assertEqual(size,[64,48]);receipt=encoding['maps'][target]
            self.assertEqual(receipt['masterSha256'],sha(masters[source]));self.assertEqual(receipt['sha256'],sha(data));self.assertEqual(report['files'][target],sha(data));self.assertEqual(receipt['bytes'],len(data));self.assertEqual(receipt['pillowDecodedRgbaSha256'],sha(pixels))
        data=self.native.read_bytes();self.assertEqual(data,encode_reference(native_before));fmt,size,pixels=decoded(data);self.assertEqual((fmt,size),('WEBP',[16,12]));native=report['nativeHeight'];self.assertEqual(native['sha256'],sha(data));self.assertEqual(native['encoding']['masterSha256'],sha(native_before));self.assertEqual(native['encoding']['pillowDecodedRgbaSha256'],sha(pixels));self.assertEqual(native['encoding']['quality'],92)
        self.assertEqual(list(self.output.rglob('*.q92-tmp')),[],'successful finishing leaves no temporary output')

    def test_legacy_recipe_is_a_complete_byte_identical_noop(self):
        before=self.snapshot();finish_runtime_skin(self.output,'sample',{});self.assertEqual(self.snapshot(),before)
        absent=self.work/'absent-output';finish_runtime_skin(absent,'no-such-skin',{});self.assertFalse(absent.exists(),'legacy branch does not read or create fitted records')

    def test_invalid_encoding_requests_are_rejected_without_writes(self):
        for request in [{}, {'format':'png','quality':92}, {'format':'webp','quality':91}, {'format':'webp','quality':92,'lossless':True}, 'webp92']:
            with self.subTest(request=request):
                before=self.snapshot()
                with self.assertRaisesRegex(ValueError,'explicit WebP quality92'):finish_runtime_skin(self.output,'sample',{'runtimeEncoding':request})
                self.assertEqual(self.snapshot(),before)

    def test_every_master_hash_is_checked_before_any_destination_changes(self):
        for which in ['diffuse.png','height.webp','native']:
            with self.subTest(which=which):
                path=self.native if which=='native' else self.folder/which;original=path.read_bytes();path.write_bytes(original+b'tampered');before=self.snapshot()
                with self.assertRaisesRegex(ValueError,'master changed before encoding'):finish_runtime_skin(self.output,'sample',self.recipe)
                self.assertEqual(self.snapshot(),before,'no earlier destination is replaced on a later master failure');path.write_bytes(original)

    def test_bad_dimensions_and_native_escape_are_rejected_before_writes(self):
        for variant in ['diffuse-size','native-size','native-path']:
            report=copy.deepcopy(self.report)
            if variant=='diffuse-size':report['dimensions']=[63,48]
            elif variant=='native-size':report['nativeHeight']['dimensions']=[15,12]
            else:report['nativeHeight']['file']='../outside.webp'
            self.record.write_text(json.dumps(report));before=self.snapshot()
            with self.subTest(variant=variant):
                with self.assertRaises(ValueError):finish_runtime_skin(self.output,'sample',self.recipe)
                self.assertEqual(self.snapshot(),before)
        self.record.write_text(json.dumps(self.report))

    def test_unresolved_temporary_and_repeat_finish_preserve_existing_bytes(self):
        leftover=self.folder/'height.webp.q92-tmp';leftover.write_bytes(b'previous unfinished work');before=self.snapshot()
        with self.assertRaisesRegex(ValueError,'Unresolved previous encode output'):finish_runtime_skin(self.output,'sample',self.recipe)
        self.assertEqual(self.snapshot(),before,'preexisting temporary is preserved and new temporary cleaned')
        leftover.unlink();finish_runtime_skin(self.output,'sample',self.recipe);finished=self.snapshot()
        with self.assertRaises(FileNotFoundError):finish_runtime_skin(self.output,'sample',self.recipe)
        self.assertEqual(self.snapshot(),finished,'cannot accidentally re-encode an already finished map')


if __name__=='__main__':
    unittest.main(verbosity=2)
