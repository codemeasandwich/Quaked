"""Public HTTP regression for canonical/retained image URLs and game ranges."""
import faulthandler
if __name__=='__main__':
    faulthandler.enable()
    faulthandler.dump_traceback_later(10)
import functools
import http.server
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
from serve import RangeHandler


class ResourceHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='quaked-resource-http-')
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)/'project'
        self.games=Path(self.temp.name)/'owned'
        image=self.root/'assets/authoring/example.png'
        image.parent.mkdir(parents=True)
        self.body=b'unchanged-authoring-image'
        image.write_bytes(self.body)
        (self.root/'assets/layout.json').write_text(json.dumps({'files':{
            'tools/source/example.png':'assets/authoring/example.png',
            'tools/source/refused.png':'../owned/private.png'},'prefixes':{}}))
        (self.root/'tools/source').mkdir(parents=True)
        (self.root/'tools/source/recipe.json').write_bytes(b'{"kept":"record"}')
        (self.games/'id1').mkdir(parents=True)
        (self.games/'id1/pak0.pak').write_bytes(b'PACK-local-game-bytes')
        (self.games/'private.png').write_bytes(b'outside-project')
        (Path(self.temp.name)/'private.png').write_bytes(b'outside-game-root')
        class Handler(RangeHandler):
            game_root=self.games.resolve()
            def log_message(self,*args):
                pass
        self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(self.root)))
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.addCleanup(self.close_server)
        self.base='http://127.0.0.1:'+str(self.server.server_port)
        # A loopback fixture must not consult macOS/system/environment proxies.
        self.opener=build_opener(ProxyHandler({}))

    def close_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def get(self,path,headers=None):
        return self.opener.open(Request(self.base+path,headers=headers or {}),timeout=5)

    def test_loopback_ignores_external_proxy_discovery(self):
        with patch('urllib.request._opener',None), patch('urllib.request.getproxies',side_effect=AssertionError('external proxy discovery')):
            with self.get('/tools/source/example.png') as response:
                self.assertEqual(response.read(),self.body)

    def test_canonical_and_retained_urls_read_same_physical_bytes(self):
        for path in ['/assets/authoring/example.png','/tools/source/example.png?v=2']:
            with self.get(path) as response:
                self.assertEqual(response.read(),self.body)
                self.assertEqual(response.headers['Content-Type'],'image/png')
        self.assertFalse((self.root/'tools/source/example.png').exists())

    def test_range_and_unmoved_record(self):
        with self.get('/tools/source/example.png',{'Range':'bytes=2-6'}) as response:
            self.assertEqual(response.status,206)
            self.assertEqual(response.read(),self.body[2:7])
            self.assertEqual(response.headers['Content-Range'],f'bytes 2-6/{len(self.body)}')
        with self.get('/tools/source/recipe.json') as response:
            self.assertEqual(response.read(),b'{"kept":"record"}')

    def test_external_game_root_range_stays_supported(self):
        with self.get('/games/id1/pak0.pak',{'Range':'bytes=0-3'}) as response:
            self.assertEqual(response.status,206)
            self.assertEqual(response.read(),b'PACK')

    def test_alias_and_game_traversal_do_not_escape_their_roots(self):
        for path in ['/tools/source/refused.png','/games/../private.png','/games/%2e%2e/private.png']:
            with self.assertRaises(HTTPError) as error:
                self.get(path)
            self.assertEqual(error.exception.code,404)


if __name__=='__main__':
    try:
        unittest.main(verbosity=2)
    finally:
        faulthandler.cancel_dump_traceback_later()
