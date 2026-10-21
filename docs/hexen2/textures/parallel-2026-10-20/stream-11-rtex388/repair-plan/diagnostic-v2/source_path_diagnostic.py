"""Bounded immutable-source seam-path suggestions, never a repaired texture.

Run only the approved three source crosses. Every output image is a separate
unmodified A/B source crop (optionally annotated), not a material composite.
"""
import argparse
from dataclasses import dataclass
import hashlib
import io
import json
import math
from pathlib import Path
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

CENTRES = ((256, 256), (128, 384), (384, 128))
STATE_LIMIT = 1_000_000
SIDE = 512
PLAN_SHA = '11e494b4d1be1cab38400bcd44b474ae5599a6b5c1ddf63829fa1bfbc4ad8519'
SEAL_SHA = '6489f190e9ec86ee01326a06fa0d42df75394786697efad35236a45450b7a8be'
DONORS_SHA = 'ad8d9a854abee4942aabef6725e6c38a06b2746677381df2139f6ef03ce95a59'
FREEZE_SHA = '0fa5f47f6e7aedcd2b7dd3e0b185905f571c97a79135d8fc602ae831b144596b'
RGB_SHA = '2faa2ec6b26ba7e0700b18101bb5c1a64a865541274562f8ebc895e7aced90ea'
PACKAGE_SHA = 'ad714db9bf3a153daae1ce0cbd3b5da25ddb2d571f438fe4a5b25641d7bea9cf'
MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 128 * 1024 * 1024


class DiagnosticError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise DiagnosticError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


class Snapshot:
    """Never replace the initial hash witness with a changed reread."""
    def __init__(self, root, expected):
        self.root = Path(root).resolve()
        self.expected = dict(expected)
        require(bool(self.expected), 'Empty source snapshot')
        self.first = {}
        total = 0
        for relative, digest in sorted(self.expected.items()):
            path = self.path(relative)
            data = path.read_bytes()
            total += len(data)
            require(len(data) <= MAX_FILE and total <= MAX_TOTAL, 'Source byte bound exceeded')
            require(sha(data) == digest, 'First input differs: ' + relative)
            self.first[relative] = digest

    def path(self, relative):
        require(isinstance(relative, str), 'Source path must be text')
        p = Path(relative)
        require(not p.is_absolute() and '..' not in p.parts,
                'Unsafe source path')
        current = self.root
        for piece in p.parts:
            current = current / piece
            require(not current.is_symlink(), 'Symlink source component')
        require(current.is_file(), 'Source not an ordinary file')
        require(current.resolve().is_relative_to(self.root), 'Source escaped root')
        return current

    def read(self, relative):
        require(relative in self.first, 'Unwatched source read')
        data = self.path(relative).read_bytes()
        require(len(data) <= MAX_FILE and sha(data) == self.first[relative],
                'Source changed since first observation: ' + relative)
        return data

    def verify(self):
        for relative in sorted(self.first):
            self.read(relative)
        return True


@dataclass
class Budget:
    limit: int = STATE_LIMIT
    used: int = 0

    def consume(self, states):
        require(type(states) is int and states >= 0, 'Invalid state charge')
        require(type(self.limit) is int and 0 < self.limit <= STATE_LIMIT, 'Invalid state limit')
        require(self.used + states <= self.limit, 'Cumulative lattice-state ceiling exceeded')
        self.used += states


def minimum_path(cost, budget, start=None, end=None):
    """Exact monotone 3-neighbour DP, true lexicographic path ties.

    Each state cell is charged, even when a fixed endpoint makes it unreachable.
    Ranks encode the lexicographic order of complete predecessor column sequences.
    """
    a = np.asarray(cost, dtype=np.float64)
    require(a.ndim == 2 and 0 < a.shape[0] <= 416 and 0 < a.shape[1] <= 25,
            'Lattice dimensions out of bounds')
    require(np.isfinite(a).all() and np.all(a >= 0), 'Nonfinite/negative cost')
    n, m = a.shape
    for p in (start, end):
        require(p is None or (type(p) is int and 0 <= p < m), 'Invalid endpoint')
    budget.consume(int(n * m))
    previous = a[0].copy()
    if start is not None:
        previous[:] = math.inf
        previous[start] = a[0, start]
    ranks = np.arange(m, dtype=np.int64)
    ranks[~np.isfinite(previous)] = m + 1
    pred = np.full((n, m), -1, dtype=np.int16)
    for row in range(1, n):
        current = np.full(m, math.inf)
        keys = []
        for col in range(m):
            possible = [p for p in range(max(0, col - 1), min(m, col + 2))
                        if math.isfinite(previous[p])]
            if not possible:
                continue
            p = min(possible, key=lambda k: (previous[k], ranks[k]))
            current[col] = previous[p] + a[row, col]
            pred[row, col] = p
            keys.append((int(ranks[p]), col))
        new_ranks = np.full(m, m + 1, dtype=np.int64)
        for rank, (_, col) in enumerate(sorted(keys)):
            new_ranks[col] = rank
        previous, ranks = current, new_ranks
    terminal = end if end is not None else min(range(m), key=lambda k: (previous[k], ranks[k]))
    require(math.isfinite(previous[terminal]), 'No legal monotone path')
    cols = [int(terminal)]
    for row in range(n - 1, 0, -1):
        cols.append(int(pred[row, cols[-1]]))
    cols.reverse()
    require(all(0 <= c < m for c in cols) and all(abs(x-y) <= 1 for x,y in zip(cols, cols[1:])),
            'DP escaped lattice')
    return {'columns': cols, 'totalCost': float(previous[terminal]),
            'meanCost': float(previous[terminal] / n),
            'maximumNodeCost': max(float(a[r, c]) for r, c in enumerate(cols)),
            'chargedStates': int(n*m)}


def luminance_gradient(rgb):
    a = np.asarray(rgb, dtype=np.float64) / 255
    require(a.shape == (SIDE, SIDE, 3) and np.isfinite(a).all(), 'Require 512-square RGB')
    lum = a @ np.array([.2126, .7152, .0722])
    g = np.abs(np.roll(lum, -1, axis=1) - np.roll(lum, 1, axis=1))
    g += np.abs(np.roll(lum, -1, axis=0) - np.roll(lum, 1, axis=0))
    return np.clip(g, 0, 1)


@dataclass
class Grid:
    name: str
    destination: np.ndarray
    owner_a: np.ndarray
    owner_b: np.ndarray
    state_values: np.ndarray

    def half(self, left):
        sl = slice(0, 48) if left else slice(48, 96)
        return Grid(self.name + ('/negative-half' if left else '/positive-half'),
                    self.destination[sl], self.owner_a[sl], self.owner_b[sl], self.state_values)


def checked_grid(name, destination, a, b, values):
    arrays = [np.asarray(p, dtype=np.int64) for p in (destination, a, b)]
    require(all(p.shape == arrays[0].shape for p in arrays), 'Coordinate shape mismatch')
    require(arrays[0].ndim == 3 and arrays[0].shape[2] == 2 and arrays[0].shape[1] == 25,
            'Require a 25-state coordinate grid')
    require(all(np.all((p >= 0) & (p < SIDE)) for p in arrays), 'Source/destination bounds escape')
    # All sampled source neighbourhoods are interior. Never score across an old bad source wrap.
    require(all(np.all((p >= 1) & (p <= SIDE-2)) for p in arrays[1:]),
            'Source gradient neighbourhood reaches old source edge')
    return Grid(name, *arrays, np.asarray(values, dtype=np.int64))


def long_grid(name, cx, cy):
    require((cx, cy) in CENTRES, 'Unapproved donor pair')
    p, v = np.meshgrid(np.arange(48, 464),
                       np.arange(24, 49) if name.endswith('+') else np.arange(464, 489),
                       indexing='ij')
    if name.startswith('X'):
        a = np.stack((v, p), axis=2)
        b = np.stack((v + cx - (512 if name.endswith('-') else 0), p), axis=2)
    else:
        require(name.startswith('Y'), 'Unknown side')
        a = np.stack((p, v), axis=2)
        b = np.stack((p, v + cy - (512 if name.endswith('-') else 0)), axis=2)
    return checked_grid(name, a, a, b, v[0])


def cap_grid(name, cx, cy):
    require((cx, cy) in CENTRES and name in ('capY+', 'capY-', 'capX+', 'capX-'),
            'Unapproved cap')
    progress = np.arange(-48, 48)
    values = np.arange(24, 49) if name.endswith('+') else np.arange(-48, -23)
    p, v = np.meshgrid(progress, values, indexing='ij')
    dx, dy = (p, v) if name.startswith('capY') else (v, p)
    destination = np.stack((dx % 512, dy % 512), axis=2)
    if name.startswith('capY'):
        a = np.stack((cx + dx, dy % 512), axis=2)  # existing X strip owner
    else:
        a = np.stack((dx % 512, cy + dy), axis=2)  # existing Y strip owner
    b = np.stack((cx + dx, cy + dy), axis=2)        # sole shared corner donor
    return checked_grid(name, destination, a, b, values)


def grid_cost(rgb, gradient, grid):
    ax, ay = grid.owner_a[:,:,0], grid.owner_a[:,:,1]
    bx, by = grid.owner_b[:,:,0], grid.owner_b[:,:,1]
    colour = np.abs(rgb[ay,ax].astype(np.float64) - rgb[by,bx].astype(np.float64)).mean(axis=2) / 255
    edge = np.maximum(gradient[ay,ax], gradient[by,bx])
    cost = colour + .25 * edge
    require(np.isfinite(cost).all() and np.all((cost >= 0) & (cost <= 1.25)), 'Invalid actual cost')
    return cost


def path_record(grid, cost, solution):
    rows = []
    for r, col in enumerate(solution['columns']):
        d, a, b = grid.destination[r,col], grid.owner_a[r,col], grid.owner_b[r,col]
        rows.append([int(d[0]), int(d[1]), int(a[0]), int(a[1]), int(b[0]), int(b[1]),
                     float(cost[r,col])])
    return {**solution, 'grid': grid.name,
            'lookupColumns': ['destX','destY','sourceAX','sourceAY','sourceBX','sourceBY','nodeCost'],
            'lookups': rows}


def cap_suggestions(rgb, gradient, grid, budget):
    require(grid.destination.shape == (96, 25, 2), 'Cap dimensions changed')
    cost = grid_cost(rgb, gradient, grid)
    negative, positive = grid.half(True), grid.half(False)
    options = []
    for anchor_index in range(25):
        left = minimum_path(cost[:48], budget, end=anchor_index)
        right = minimum_path(cost[48:], budget, start=anchor_index)
        a = path_record(negative, cost[:48], left)
        b = path_record(positive, cost[48:], right)
        # Paired halves share the same signed cap ordinate across -1/0 torus cells.
        for first, second in ((a['lookups'][-1][2:4], b['lookups'][0][2:4]),
                              (a['lookups'][-1][4:6], b['lookups'][0][4:6])):
            expected = [1,0] if grid.name.startswith('capY') else [0,1]
            require([second[k]-first[k] for k in range(2)] == expected,
                    'Paired cap anchor broke source adjacency')
        options.append({'anchorIndex': anchor_index,
                        'signedAnchorCoordinate': int(grid.state_values[anchor_index]),
                        'totalCost': left['totalCost'] + right['totalCost'],
                        'meanCost': (left['totalCost'] + right['totalCost']) / 96,
                        'negativeHalf': a, 'positiveHalf': b,
                        'sharedAnchorAdjacentSourceCells': True})
    options.sort(key=lambda x: (x['totalCost'], x['signedAnchorCoordinate'],
                               x['negativeHalf']['columns'], x['positiveHalf']['columns']))
    return {'grid': grid.name, 'evaluatedAnchorPositions': 25, 'suggestions': options[:3]}, cost


def bbox(coords, pad=6):
    points = coords.reshape(-1,2)
    return [max(0, int(points[:,0].min())-pad), max(0, int(points[:,1].min())-pad),
            min(512, int(points[:,0].max())+pad+1), min(512, int(points[:,1].max())+pad+1)]


def pair_evidence(image, grid, paths, annotation):
    """Separate literal source crops only; never assemble a repaired material."""
    boxes = [bbox(grid.owner_a), bbox(grid.owner_b)]
    crops = [image.crop(tuple(b)) for b in boxes]
    vertical = max(im.height for im in crops) > max(im.width for im in crops)
    scale = 2 if annotation else 1
    width = max(im.width for im in crops)*scale
    height = max(im.height for im in crops)*scale
    if vertical:
        size, origins = (max(800, 2*width+60), height+92), [(4,72),(max(400,width+36),72)]
    else:
        size, origins = (max(800,width+8), 2*height+136), [(4,72),(4,height+112)]
    sheet = Image.new('RGB', size, (25,27,30))
    draw = ImageDraw.Draw(sheet)
    draw.text((4,4), grid.name+' - separate original A/B source crops; '+('path suggestions' if annotation else 'unmarked'), fill='white')
    draw.text((4,22), 'Source rectangles A '+str(boxes[0])+' / B '+str(boxes[1]), fill='white')
    draw.text((4,40), 'NEAREST display '+str(scale)+'x; no blend, transport trial or repaired texture. ART remains HOLD.', fill='white')
    colours = [(255,70,180),(60,225,255),(255,190,45)]
    for owner, (crop, origin, box) in enumerate(zip(crops, origins, boxes)):
        tile = crop.resize((crop.width*scale,crop.height*scale), Image.Resampling.NEAREST)
        if annotation:
            td = ImageDraw.Draw(tile)
            for i, path in enumerate(paths):
                offset = 2 if owner == 0 else 4
                points = [((r[offset]-box[0])*scale, (r[offset+1]-box[1])*scale) for r in path]
                td.line(points, fill=colours[i % len(colours)], width=max(1,scale))
        sheet.paste(tile, origin)
    out = io.BytesIO()
    sheet.save(out, 'PNG')
    return out.getvalue(), {'A_sourceRect':boxes[0], 'B_sourceRect':boxes[1],
                            'cropDisplayOrigins':origins, 'displayScale':scale,'filter':'NEAREST','separateOriginalCrops':True}


def diagnostic(rgb, budget):
    image = Image.fromarray(rgb, 'RGB')
    gradient = luminance_gradient(rgb)
    candidates, payloads, evidence = [], {}, {}
    for index, (cx,cy) in enumerate(CENTRES):
        name = 'C'+str(index)
        record = {'candidate':name, 'centre':[cx,cy], 'longPaths':{}, 'caps':{},
                  'junctionStatus':'UNRESOLVED: suggested cuts are not merged into a binary ownership atlas.'}
        for side in ('X+','X-','Y+','Y-'):
            grid = long_grid(side,cx,cy)
            cost = grid_cost(rgb,gradient,grid)
            path = path_record(grid,cost,minimum_path(cost,budget))
            record['longPaths'][side] = path
            for marked in (False,True):
                label = name+'-side-'+side.replace('+','plus').replace('-','minus')+('-annotated' if marked else '-unmarked')+'.png'
                data, provenance = pair_evidence(image,grid,[path['lookups']],marked)
                payloads[label], evidence[label] = data, provenance
        for side in ('capY+','capY-','capX+','capX-'):
            grid = cap_grid(side,cx,cy)
            result, _ = cap_suggestions(rgb,gradient,grid,budget)
            record['caps'][side] = result
            paths = [s['negativeHalf']['lookups']+s['positiveHalf']['lookups'] for s in result['suggestions']]
            for marked in (False,True):
                label = name+'-'+side.replace('+','plus').replace('-','minus')+('-annotated' if marked else '-unmarked')+'.png'
                data, provenance = pair_evidence(image,grid,paths,marked)
                payloads[label], evidence[label] = data, provenance
        record['unresolvedJunctions'] = [
            {'signedCornerQuadrant':q, 'status':'HOLD pending joint parent/X/Y/corner ownership and actual fibre/occlusion review'}
            for q in ('--','-+','+-','++')]
        candidates.append(record)
    require(budget.used == 844800, 'Unexpected diagnostic state count')
    return {'candidates':candidates,'latticeStateEvaluations':budget.used,
            'stateLimit':budget.limit,'sourceCostCells':153600,
            'tiePolicy':'minimum cumulative cost; true lexicographic column sequence; cap ties use lower signed anchor then path sequences',
            'pixelConvention':'Integer path sample coordinates; boundary samples are not changed-pixel or material-ownership claims.',
            'cost':'mean(abs(RGB_A-RGB_B))/255 + .25*max(clipped central luminance gradients)',
            'evidence':evidence}, payloads


def publish_outputs(snapshot, directory, name, payloads, result):
    require(re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', name) is not None, 'Unsafe output name')
    require(all(re.fullmatch(r'[a-zA-Z0-9_-]+\.png', key) for key in payloads), 'Unsafe evidence filename')
    directory = Path(directory)
    require(directory.is_dir() and not directory.is_symlink(), 'Output parent must exist without symlink')
    output = directory / name
    require(not output.exists() and not output.is_symlink(), 'Output already exists')
    snapshot.verify()
    output.mkdir(mode=0o700)  # Native mkdir is an exclusive no-clobber destination claim.
    try:
        for filename,data in sorted(payloads.items()):
            with (output/filename).open('xb') as f:
                f.write(data)
        snapshot.verify()
        result = {**result, 'firstInputHashes':dict(snapshot.first),
                  'allFirstInputsRecheckedExactBeforeAndAfter':True,
                  'outputFiles':{name:{'sha256':sha(data),'bytes':len(data)} for name,data in payloads.items()}}
        with (output/'result.json').open('x') as f:
            json.dump(result,f,indent=2)
            f.write('\n')
    except Exception as error:
        # Partial diagnostic evidence is retained, never a success receipt.
        with (output/'failure.json').open('x') as f:
            json.dump({'status':'DIAGNOSTIC_PUBLICATION_FAILED_NO_QUALIFIED_RESULT',
                       'error':str(error),'initialInputHashesPreserved':dict(snapshot.first)},f,indent=2)
        raise
    return output


def validate_approval(approval):
    require(isinstance(approval, dict) and isinstance(approval.get('verdict'), str), 'Malformed approval')
    require(approval['verdict'].startswith('PASS') and approval.get('plan', {}).get('sha256') == PLAN_SHA,
            'Independent diagnostic plan is not approved')
    expected = {'centres':[list(c) for c in CENTRES], 'wrapCollarMasterPixels':48,
                'protectedCentralRectangle':[48,48,464,464], 'capAnchorsMaximum':25,
                'maximumLatticeStates':STATE_LIMIT}
    require(approval.get('parameters') == expected, 'Approved diagnostic bounds differ')


def production_context():
    repo = Path(__file__).resolve().parents[7]
    stream = repo/'docs/hexen2/textures/parallel-2026-10-20/stream-11-rtex388'
    plan = stream/'repair-plan'
    library = repo/'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/parallel-2026-10-20/stream-11-rtex388'
    files = {plan/'DIAGNOSTIC-PLAN-v2.md':PLAN_SHA, plan/'diagnostic-plan-v2.json':SEAL_SHA,
             plan/'bounded-offset-set-v2.json':DONORS_SHA, stream/'CANDIDATE_FREEZE.json':FREEZE_SHA,
             library/'masters/rtex388-v1/color.png':RGB_SHA,
             library/'masters/rtex388-v1/master.json':PACKAGE_SHA}
    for p,digest in files.items():
        require(p.is_file() and sha(p.read_bytes()) == digest, 'Approved input seal differs: '+str(p))
    approval_path = plan/'root-diagnostic-plan-review-v2.json'
    approval_bytes = approval_path.read_bytes()
    validate_approval(json.loads(approval_bytes))
    frozen = json.loads((stream/'CANDIDATE_FREEZE.json').read_bytes())['files']
    require(len(frozen) == 80 and len({r['file'] for r in frozen}) == 80, 'Require exact 80-file freeze')
    expected = {r['file']:r['sha256'] for r in frozen}
    for p,digest in files.items():
        relative = str(p.relative_to(repo))
        require(relative not in expected or expected[relative] == digest, 'Freeze conflicts with approved input')
        expected[relative] = digest
    expected[str(approval_path.relative_to(repo))] = sha(approval_bytes)
    expected[str(Path(__file__).resolve().relative_to(repo))] = sha(Path(__file__).read_bytes())
    snapshot = Snapshot(repo,expected)
    source_relative = str((library/'masters/rtex388-v1/color.png').relative_to(repo))
    with Image.open(io.BytesIO(snapshot.read(source_relative))) as image:
        require(image.format == 'PNG' and image.mode == 'RGB' and image.size == (512,512), 'Require sealed RGB512 PNG')
        rgb = np.asarray(image).copy()
    return snapshot,rgb,stream


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-name',default='actual-v1')
    args = parser.parse_args()
    snapshot,rgb,stream = production_context()
    directory = Path(__file__).resolve().parent/'runs'
    directory.mkdir(exist_ok=True)
    require(re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',args.output_name) is not None, 'Unsafe output name')
    require(not (directory/args.output_name).exists() and not (directory/args.output_name).is_symlink(),
            'Output already exists')
    # Reserve the one actual-source cumulative allowance; an interrupted run is never silently reset.
    journal = Path(__file__).resolve().parent/'actual-run-journal.json'
    initial = {'state':'ISSUED_SOURCE_ONLY_DIAGNOSTIC','reservedStateCeiling':STATE_LIMIT,
               'sourceSha256':RGB_SHA,'automaticRetry':False,
               'note':'On interruption, reconcile this run; do not renew the source-state budget.'}
    with journal.open('x') as f:
        json.dump(initial,f,indent=2)
        f.write('\n')
    budget = Budget()
    try:
        result,payloads = diagnostic(rgb,budget)
        result.update({'status':'SOURCE_ONLY_PATH_SUGGESTIONS_ART_F1_HOLD',
                       'scope':'No repaired RGB, binary ownership atlas, material trial, height or tier output. Suggestions and separate source crops only.',
                       'frozenCandidateFiles':80,'generationCountUnchanged':1,
                       'acceptance':'Algorithm output only; scores are not fibre continuity, naturalness, BOX32/16, physical or ART acceptance.'})
        output = publish_outputs(snapshot,directory,args.output_name,payloads,result)
        final = {**initial,'state':'COMPLETED_SOURCE_ONLY_SUGGESTIONS_ART_HOLD',
                 'usedStates':budget.used,'unusedReservedStates':STATE_LIMIT-budget.used,
                 'output':str(output),'resultSha256':sha((output/'result.json').read_bytes())}
    except Exception as error:
        journal.write_text(json.dumps({**initial,'state':'FAILED_OR_UNRESOLVED_NO_RETRY',
                                      'knownChargedStates':budget.used,'error':str(error)},indent=2)+'\n')
        raise
    journal.write_text(json.dumps(final,indent=2)+'\n')
    print(json.dumps({'status':result['status'],'output':str(output),
                      'states':result['latticeStateEvaluations'],'candidatePairs':3,
                      'evidencePngCount':len(payloads),'all80FreezeInputsExact':True,
                      'resultSha256':final['resultSha256']}))


if __name__=='__main__':
    try:
        main()
    except (DiagnosticError,OSError,KeyError,ValueError) as error:
        print('Diagnostic refused: '+str(error),file=sys.stderr)
        raise SystemExit(1)
