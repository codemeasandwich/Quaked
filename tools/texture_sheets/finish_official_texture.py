#!/usr/bin/env python3
"""Source-locked finishing of GPT-generated texture detail (owner-approved).

The original is the authority for palette, intention and distant appearance.
Photographic mode retains full generated natural forms with one smooth coarse
colour correction, following the owner's clarified artistic direction. The
older strict mode is retained to reproduce earlier projection trials. Periodic
filters avoid adding a correction-field frame. Metrics never establish visual
qualification by themselves or repair wrong geometry/non-tiling source art.
No source image is modified. Output and a provenance/measurement receipt are new
files. This is texture registration, not a claim of recovered physical detail.
"""
import argparse
import hashlib
import json
from io import BytesIO
from pathlib import Path
import numpy as np
from PIL import Image


def periodic_resize(a, width, height):
    """Float RGB reconstruction with a wrapped neighbourhood, no clamped rim."""
    h, w, _ = a.shape
    result = []
    for channel in range(3):
        tile = np.tile(a[:, :, channel], (3, 3)).astype(np.float32)
        image = Image.fromarray(tile, 'F').resize((width*3, height*3), Image.Resampling.BICUBIC)
        result.append(np.asarray(image)[height:height*2, width:width*2])
    return np.stack(result, axis=2)


def area(a, factor):
    h, w, c = a.shape
    return a.reshape(h//factor, factor, w//factor, factor, c).mean((1, 3))


def periodic_blur(a, sigma):
    """Gaussian convolution on the torus; same treatment at borders/interior."""
    h, w, _ = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    kernel = np.exp(-2*np.pi*np.pi*sigma*sigma*(fx*fx+fy*fy))
    return np.fft.ifft2(np.fft.fft2(a, axes=(0, 1))*kernel[:, :, None], axes=(0, 1)).real


def metrics(a):
    dx = np.abs(a-np.roll(a, 1, axis=1)).mean(axis=2)
    dy = np.abs(a-np.roll(a, 1, axis=0)).mean(axis=2)
    return dict(wrap_x_mean=float(dx[:, 0].mean()), wrap_y_mean=float(dy[0].mean()),
                interior_x_mean=float(dx[:, 1:].mean()), interior_y_mean=float(dy[1:].mean()))


def finish(original, generated, factor=4, strength=0.7, vertical_landmarks=None, comparison_divisor=2,
           method='photographic', color_strength=0.65, field_sigma=0.75, edge_anchor=False):
    if factor not in (4, 8, 16):
        raise ValueError('Use a bounded integer enlargement: 4, 8 or 16')
    if not 0 <= strength <= 1:
        raise ValueError('Detail strength must be in [0,1]')
    if method not in ('strict', 'photographic') or not 0 <= color_strength <= 1 or not 0.25 <= field_sigma <= 4:
        raise ValueError('Invalid method or photographic colour-field settings')
    if edge_anchor and method != 'photographic':
        raise ValueError('Edge anchoring is supported only in photographic mode')
    source = np.asarray(original.convert('RGB'), dtype=np.float64)
    h, w, _ = source.shape
    if comparison_divisor not in (1, 2, 4) or w % comparison_divisor or h % comparison_divisor:
        raise ValueError('Comparison divisor must be 1, 2 or 4 and divide original dimensions')
    if method == 'photographic' and comparison_divisor not in (2, 4):
        raise ValueError('Photographic mode uses half-original comparison; quarter is retained for historical replay')
    target = area(source, comparison_divisor)
    if w*h*factor*factor > 16777216:
        raise ValueError('Output exceeds 16 million pixels')
    donor = np.asarray(generated.convert('RGB').resize((w*factor, h*factor), Image.Resampling.LANCZOS), dtype=np.float64)
    if vertical_landmarks is not None:
        pairs = np.asarray(vertical_landmarks, dtype=float)
        if pairs.ndim != 2 or pairs.shape[1] != 2 or len(pairs) < 2 or not np.isfinite(pairs).all():
            raise ValueError('Landmarks must be finite [originalY, generatedY] pairs in native texels')
        if not np.array_equal(pairs[0], [0, 0]) or not np.array_equal(pairs[-1], [h, h]) or np.any(np.diff(pairs, axis=0) <= 0):
            raise ValueError('Landmarks must increase strictly from [0,0] to [height,height]')
        # Explicit measured rail registration, never an automatic content guess.
        yy = np.interp((np.arange(h*factor)+0.5)/factor, pairs[:, 0], pairs[:, 1])*factor-0.5
        lo = np.floor(yy).astype(int); fraction = (yy-lo)[:, None, None]
        donor = donor[lo % (h*factor)]*(1-fraction)+donor[(lo+1) % (h*factor)]*fraction
    if method == 'photographic':
        # Owner's clarified direction: retain plausible photographic contours,
        # not native pixel boundaries. Only reduced-size colour information from
        # the original enters this correction; it is deliberately not iterated
        # to equality and cannot repair wrong geometry or a non-tiling donor.
        coarse_donor = area(donor, factor*comparison_divisor)
        field = periodic_blur(target-coarse_donor, field_sigma)
        correction = periodic_resize(field, w*factor, h*factor)*color_strength
        raw = donor+correction
        if edge_anchor:
            # A reviewed native join may expose an invented bright perimeter.
            # Anchor only the four edge MEAN colours, not native pixel patterns.
            # The one-native-texel smooth band retains donor grain and never
            # shifts/crops features. Optional: this is not a universal tiler.
            oh, ow, _ = raw.shape
            y = np.arange(oh); x = np.arange(ow)
            fade = lambda a: (1-np.clip(a/factor,0,1))**2*(1+2*np.clip(a/factor,0,1))
            weights = [np.broadcast_to(fade(y)[:,None],(oh,ow)),np.broadcast_to(fade(oh-1-y)[:,None],(oh,ow)),
                       np.broadcast_to(fade(x)[None,:],(oh,ow)),np.broadcast_to(fade(ow-1-x)[None,:],(oh,ow))]
            source_edges = [source[0].mean(0),source[-1].mean(0),source[:,0].mean(0),source[:,-1].mean(0)]
            current_edges = [raw[0].mean(0),raw[-1].mean(0),raw[:,0].mean(0),raw[:,-1].mean(0)]
            adjust = sum(weight[:,:,None]*(a-b) for weight,a,b in zip(weights,source_edges,current_edges))
            raw += adjust/np.maximum(1,sum(weights))[:,:,None]
        pixels = np.rint(np.clip(raw, 0, 255)).astype(np.uint8)
        error = area(pixels.astype(float), factor*comparison_divisor)-target
        dy = np.diff(donor, axis=0).ravel(); oy = np.diff(pixels.astype(float), axis=0).ravel()
        contour_correlation = float(np.corrcoef(dy, oy)[0, 1]) if dy.std() and oy.std() else None
        receipt = dict(method=method, factor=factor, verticalLandmarks=vertical_landmarks,
                       colorStrength=color_strength, fieldSigma=field_sigma, edgeAnchor=edge_anchor,
                       comparisonDivisor=comparison_divisor, comparisonDimensions=[w//comparison_divisor,h//comparison_divisor],
                       distanceMeanMaxError=float(np.abs(error).max()), distanceMeanMAE=float(np.abs(error).mean()),
                       donorDistanceMAE=float(np.abs(coarse_donor-target).mean()),
                       newClippedChannelFraction=float(np.mean(((raw<0)|(raw>255))&((donor>0)&(donor<255)))),
                       donorContourCorrelation=contour_correlation,
                       sourceMean=source.mean((0,1)).tolist(),outputMean=pixels.mean((0,1)).tolist(),
                       donorBoundaries=metrics(donor),boundaries=metrics(pixels.astype(float)),
                       passedDistanceCheck=None,
                       qualification='Reduced-size colour metrics are diagnostics, not pixel-equality acceptance. Half-native is the primary view; quarter-native is a secondary farther view. Photographic form, intention, feature scale and tile joins require visual review.')
        return Image.fromarray(pixels, 'RGB'), receipt
    # Suppress donor features larger than a native texel. Gaussian separation
    # is gradual; the projection below locks the specified distant comparison.
    residual = donor-periodic_blur(donor, factor*0.5)
    # Raised boundaries in a generated image are not a texture feature. Fade
    # only donor residual near the outer edge; the original reconstruction is
    # never darkened/brightened and its intentional edge features remain.
    y = np.minimum(np.arange(h*factor)+0.5, h*factor-np.arange(h*factor)-0.5)
    x = np.minimum(np.arange(w*factor)+0.5, w*factor-np.arange(w*factor)-0.5)
    mask = np.minimum(np.minimum(y[:, None], x[None, :])/(2*factor), 1)
    mask = mask*mask*(3-2*mask)
    out = periodic_resize(source, w*factor, h*factor)+strength*residual*mask[:, :, None]
    # Repeated smooth correction avoids native-cell-sized constant offsets
    # (which would draw a new grid into the higher-resolution image).
    for step in range(100):
        out = np.clip(out, 0, 255)
        error = target-area(out, factor*comparison_divisor)
        if np.abs(error).max() < 0.08:
            break
        out += periodic_resize(error, w*factor, h*factor)
    pixels = np.rint(np.clip(out, 0, 255)).astype(np.uint8)
    native_error = area(pixels.astype(float), factor)-source
    error = area(pixels.astype(float), factor*comparison_divisor)-target
    receipt = dict(method=method, factor=factor, detailStrength=strength, verticalLandmarks=vertical_landmarks, projectionIterations=step+1,
                   comparisonDivisor=comparison_divisor, comparisonDimensions=[w//comparison_divisor,h//comparison_divisor],
                   distanceMeanMaxError=float(np.abs(error).max()), distanceMeanMAE=float(np.abs(error).mean()),
                   nativeDiagnosticMaxError=float(np.abs(native_error).max()),
                   sourceMean=source.mean((0, 1)).tolist(), outputMean=pixels.mean((0, 1)).tolist(),
                   boundaries=metrics(pixels.astype(float)),
                   passedDistanceCheck=bool(np.abs(error).max() <= 1.0),
                   qualification='Historical strict projection at the recorded comparison divisor. This is not the current visual-similarity acceptance policy.')
    if not receipt['passedDistanceCheck']:
        raise ValueError('Distant appearance projection failed: '+json.dumps(receipt))
    return Image.fromarray(pixels, 'RGB'), receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--original', type=Path, required=True)
    parser.add_argument('--generated', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--factor', type=int, default=4, help='Runtime standard: four times each native dimension. Larger factors replay historical authoring experiments.')
    parser.add_argument('--strength', type=float, default=0.7)
    parser.add_argument('--comparison-divisor', type=int, default=2, help='2: current half-native distance comparison; 4 and1 retained for historical replay')
    parser.add_argument('--method', choices=['strict','photographic'], default='photographic', help='photographic preserves natural forms; strict is explicit historical replay only')
    parser.add_argument('--color-strength', type=float, default=0.65)
    parser.add_argument('--field-sigma', type=float, default=0.75, help='Photographic correction smoothing in reduced-reference pixels')
    parser.add_argument('--edge-anchor', action='store_true', help='Reviewed photographic joins only: match native edge mean colours in a one-native-texel smooth band')
    parser.add_argument('--vertical-landmarks', type=Path, help='Reviewed [originalY,generatedY] native-texel coordinate pairs')
    args = parser.parse_args()
    if args.output.suffix.lower() != '.png':
        raise ValueError('Candidate output must be lossless PNG')
    if args.output.exists() or args.output.with_suffix('.json').exists():
        raise ValueError('Refusing to overwrite an existing candidate or receipt')
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    tool_hash = digest(Path(__file__))
    original_bytes, generated_bytes = args.original.read_bytes(), args.generated.read_bytes()
    landmark_bytes = args.vertical_landmarks.read_bytes() if args.vertical_landmarks else None
    with Image.open(BytesIO(original_bytes)) as original, Image.open(BytesIO(generated_bytes)) as generated:
        landmarks = json.loads(landmark_bytes) if landmark_bytes is not None else None
        output, receipt = finish(original, generated, args.factor, args.strength, landmarks, args.comparison_divisor,
                                 args.method, args.color_strength, args.field_sigma,args.edge_anchor)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output)
    receipt.update(original=str(args.original), generated=str(args.generated), output=str(args.output),
                   originalSha256=hashlib.sha256(original_bytes).hexdigest(), generatedSha256=hashlib.sha256(generated_bytes).hexdigest(),
                   outputSha256=digest(args.output), outputDimensions=list(output.size),
                   toolSha256=tool_hash,
                   landmarkFile=str(args.vertical_landmarks) if args.vertical_landmarks else None,
                   landmarkSha256=hashlib.sha256(landmark_bytes).hexdigest() if landmark_bytes is not None else None)
    args.output.with_suffix('.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
