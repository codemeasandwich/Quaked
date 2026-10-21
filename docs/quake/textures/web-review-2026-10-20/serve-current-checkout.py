from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import os
ROOT=Path('/Users/bri/.codex/worktrees/fc24/Quaked')
DEPS=Path('/Users/bri/SOURCE/Quaked/node_modules/three')
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  raw=path.split('?',1)[0].split('#',1)[0]
  if raw.startswith('/__deps/three/'):
   result=(DEPS/raw[len('/__deps/three/'):]).resolve()
   if not result.is_relative_to(DEPS.resolve()):return str(ROOT/'__not_found')
   return str(result)
  return super().translate_path(path)
os.chdir(ROOT)
server=ThreadingHTTPServer(('127.0.0.1',4329),Handler)
print('Quake texture review http://127.0.0.1:4329/tests/quake_texture_tiers_trial.html',flush=True)
server.serve_forever()
