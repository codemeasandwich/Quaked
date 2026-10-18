"""Serve this folder over HTTP for local play, like `python3 -m http.server`, plus byte ranges.

    python3 tools/serve.py 8000            # from the repository's root

Python's own server ignores `Range` requests and always sends the whole file. The game catalogue (card [34b],
src/engine/common/game_catalogue.js) reads only a pack's 12-byte header and its directory, so on that server it can
see that a pack you own is there but not check it without downloading all of it. This server answers a single
`bytes=start-end` range with `206 Partial Content`; everything else is served exactly as `http.server` serves it.
"""
import http.server
import os
import re
import sys
import argparse
from pathlib import Path
from urllib.parse import urlsplit, unquote
from resource_paths import resource_path


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    game_root = None

    def translate_path(self, path):
        logical = unquote(urlsplit(path).path)
        if self.game_root is not None and logical.startswith('/games/'):
            candidate = (self.game_root / logical[len('/games/'):]).resolve()
            if candidate.is_relative_to(self.game_root):
                return str(candidate)
            return str(self.game_root / '__refused_path__')
        original = Path(super().translate_path(path))
        directory = Path(self.directory)
        root = directory.resolve()
        # The standard handler normalizes URL traversal first. Resolve only the
        # resulting local file through the same layout used by authoring tools.
        relative = original.relative_to(directory)
        mapped = resource_path(root, relative)
        if mapped == root / relative:
            return str(original)
        if mapped.resolve().is_relative_to(root):
            return str(mapped)
        return str(root / '__refused_path__')

    def send_head(self):
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', self.headers.get('Range', '').strip())
        path = self.translate_path(self.path)
        if not match or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start, end = match.groups()
        if start == '':  # a suffix range: the last `end` bytes
            start, end = max(0, size - int(end or 0)), size - 1
        else:
            start, end = int(start), min(int(end) if end else size - 1, size - 1)
        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.end_headers()
            return None
        handle = open(path, 'rb')
        handle.seek(start)
        self._range_left = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self._range_left))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Last-Modified', self.date_time_string(int(os.path.getmtime(path))))
        self.end_headers()
        return handle

    def copyfile(self, source, outputfile):
        left = getattr(self, '_range_left', None)
        if left is None:
            return super().copyfile(source, outputfile)
        self._range_left = None
        while left > 0:
            chunk = source.read(min(65536, left))
            if not chunk:
                break
            outputfile.write(chunk)
            left -= len(chunk)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('port', nargs='?', type=int, default=8000)
    parser.add_argument('--game-root', type=Path, help='Read-only external games directory, exposed locally as /games/')
    args = parser.parse_args()
    port = args.port
    if args.game_root:
        RangeHandler.game_root = args.game_root.expanduser().resolve(strict=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), RangeHandler).serve_forever()
