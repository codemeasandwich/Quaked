"""Check generated local review HTML bindings without browser navigation."""
import datetime
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
DOC = Path(__file__).resolve().parent
BASE = ROOT/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-14-rtex336'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'img':
            self.images.append(attributes)
        if tag == 'script':
            self.scripts.append(attributes)


def main():
    html = BASE/'review/index.html'
    before = html.read_bytes()
    parser = Parser()
    parser.feed(before.decode())
    expected = {f'rtex336-{tier}-{role}.jpg' for tier in ('mid','high') for role in ('review','relief')}
    assert {row['src'] for row in parser.images} == expected
    assert len(parser.images) == 4 and not parser.scripts
    assert b'Mid (default) [256, 512]' in before and b'High [512, 1024]' in before
    images = []
    for row in parser.images:
        path = html.parent/row['src']
        assert path.is_file() and path.parent.resolve() == html.parent.resolve()
        images.append({'file':str(path.relative_to(ROOT)), 'sha256':digest(path), 'alt':row.get('alt')})
    assert html.read_bytes() == before
    report = {'schemaVersion':1, 'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'verdict':'PASS actual static HTML structure/4image bindings/default dimensions; no browser rendering claim',
              'HTML':{'file':str(html.relative_to(ROOT)), 'sha256':digest(html)}, 'images':images,
              'scriptCount':0, 'default':'Mid', 'dimensions':{'Mid':[256,512], 'High':[512,1024]},
              'actualCLIReplay':'candidate-self-replay.json',
              'verifier':{'file':str(Path(__file__).relative_to(ROOT)), 'sha256':digest(Path(__file__))},
              'limits':'Static source and content provenance plus direct JPEG inspection; no live browser or interaction.'}
    with (DOC/'html-static-contract.json').open('x') as file:
        file.write(json.dumps(report,indent=2)+'\n')
    observation = {'schemaVersion':1,'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   'state':'STATIC_HTML_AND_DIRECT_CONTENT_ONLY_NO_BROWSER_RENDER_OBSERVED',
                   'priorCampaignObservation':{'file':'docs/hexen2/textures/parallel-2026-10-20/stream-13-ttex262/html-browser-observation.json','sha256':digest(ROOT/'docs/hexen2/textures/parallel-2026-10-20/stream-13-ttex262/html-browser-observation.json')},
                   'reason':'Supported browser previously explicitly rejected file protocol and prohibited workaround or alternate surfaces. No new browser attempt for this texture and no workaround.',
                   'browserRenderedPASS':False,'screenshotsObserved':0,
                   'actualChecks':'Static HTML4image bindings, reviewCLI content replay, direct JPEG/decodedPNG inspection.',
                   'scopeLimit':'No live browser/interaction or native runtime claim.'}
    with (DOC/'html-browser-observation.json').open('x') as file:
        file.write(json.dumps(observation,indent=2)+'\n')
    print(json.dumps({'HTMLSHA256':digest(html), 'images':4, 'browserRenderedPASS':False}))


if __name__ == '__main__':
    main()
