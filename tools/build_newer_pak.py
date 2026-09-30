#!/usr/bin/env python3
"""Build newer.pak, the Newer Game pack, from the loose files in newer/.

    python3 tools/build_newer_pak.py [out.pak]

The pack is an ordinary Quake pak (PACK header, 64-byte directory entries). Files keep the names they
have as loose files ("newer/textures/index.json"), so the engine reads the same path from the pack
or, without newer.pak, from the folder. The engine only looks in it while Newer Game is on.

Per-map files go in newer/maps/ and are stored as "maps/<name>" (the engine finds them like the
game's own maps):
    e1m1.lit   coloured lightmaps for the map (RGB light, made by ericw-tools' light -lit)
    e1m1.ent   the map's entity list, in place of the one in the BSP
"""
import os, struct, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'newer')

def entries():
    out = []
    for dirpath, dirs, files in os.walk(SRC):
        dirs[:] = [d for d in dirs if not d.startswith('_')]  # _unused and the like stay out
        for f in sorted(files):
            if f.startswith('.'): continue
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, SRC).replace(os.sep, '/')
            name = rel if rel.startswith('maps/') else 'newer/' + rel
            out.append((name, full))
    return sorted(out)

def main(out_path):
    files = entries(); data = bytearray(b'PACK' + b'\0' * 8); table = []
    for name, full in files:
        if len(name.encode()) > 55: sys.exit('name too long for a pak: ' + name)
        b = open(full, 'rb').read(); table.append((name, len(data), len(b))); data += b
    off = len(data)
    for name, pos, ln in table: data += struct.pack('<56sii', name.encode(), pos, ln)
    data[4:12] = struct.pack('<ii', off, len(table) * 64)
    open(out_path, 'wb').write(data)
    print(f'{out_path}: {len(table)} files, {len(data) / 1e6:.1f} MB')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'newer.pak'))
