#!/usr/bin/env python3
"""The skill door plates (skill0..skill3) are 32 texels wide but the plate itself is only the left 24; the
rest is the dark strip and ladder beside it, and the level shows only the plate (u 0..24).  The upscaled
pictures had the plate stretched over the whole width, so the lettering was cut off at the edge and
off centre.  This squeezes the plate back into the left three quarters and puts the original's strip
beside it.  Run from the repo root (needs wall-sheets/).
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'texture_sheets'))
from PIL import Image
from _match_orig import orig

for n in ('skill0', 'skill1', 'skill2', 'skill3'):
    fn = 'newer/textures/%s.webp' % n
    im = Image.open(fn).convert('RGB'); W, H = im.size; o = orig[n]; k = W // o.size[0]
    pw = 24 * k
    out = Image.new('RGB', (W, H))
    out.paste(im.resize((pw, H), Image.LANCZOS), (0, 0))
    strip = o.crop((24, 0, 32, o.size[1])).resize((8 * k, H), Image.BICUBIC)
    out.paste(strip, (pw, 0))
    out.save(fn, quality=92, method=6)
