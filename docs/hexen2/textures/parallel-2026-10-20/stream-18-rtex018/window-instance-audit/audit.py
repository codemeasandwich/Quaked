"""Read-only BSP29 rtex018 face/UV-cell/adjacency audit for the native demos.

No engine, authoring asset, model call, source registration or build operation.
UV-cell coverage is compiled geometry, never confirmed physical/visible windows.
"""
from pathlib import Path
import collections, datetime, hashlib, itertools, json, math, re, struct
import numpy as np

R = Path('/Users/bri/SOURCE/Quaked')
D = Path(__file__).parent
S = D.parent
ID = '7e009202100d48cda293f836a437e30d54c8d5a28ab7d190892a9c3683e397b6'
EPS = 1e-7
sha = lambda b: hashlib.sha256(b).hexdigest()
proof_path = S/'native-proof.json'
proof_bytes = proof_path.read_bytes()
proof = json.loads(proof_bytes)
variant = next(x for x in proof['variants'] if x['nativeIdentity'] == ID)
occurrences = [x for x in variant['provenance'] if x['profile'] == 'base'
               and x['map'] in ('maps/cath.bsp', 'maps/demo1.bsp')]
assert sum(x['faces'] for x in occurrences) == 218
watched = {str(proof_path): sha(proof_bytes)}


def area(poly):
    if len(poly) < 3:
        return 0.0
    p = np.asarray(poly, dtype=float)
    return abs(float(np.sum(p[:, 0]*np.roll(p[:, 1], -1) - p[:, 1]*np.roll(p[:, 0], -1))/2))


def halfplane(poly, axis, value, greater):
    if not len(poly):
        return []
    out = []
    prev = np.asarray(poly[-1], float)
    prev_in = prev[axis] >= value if greater else prev[axis] <= value
    for point in poly:
        point = np.asarray(point, float)
        now_in = point[axis] >= value if greater else point[axis] <= value
        if now_in != prev_in:
            t = (value-prev[axis])/(point[axis]-prev[axis])
            out.append((prev+t*(point-prev)).tolist())
        if now_in:
            out.append(point.tolist())
        prev, prev_in = point, now_in
    return out


def cells(poly):
    p = np.asarray(poly, float)
    lo, hi = p.min(0), p.max(0)
    result = []
    x0, y0 = np.floor(lo+EPS).astype(int)
    x1, y1 = np.ceil(hi-EPS).astype(int)
    assert (x1-x0)*(y1-y0) < 50000, 'Bounded audit cell budget exceeded'
    for y in range(y0, y1):
        for x in range(x0, x1):
            q = poly
            for axis, val, greater in [(0, x, True), (0, x+1, False),
                                        (1, y, True), (1, y+1, False)]:
                q = halfplane(q, axis, val, greater)
            covered = area(q)
            if covered > EPS:
                assert covered <= 1+1e-6
                result.append({'cell': [x, y], 'coveredAreaInUnitCell': covered,
                               'isFullCellCoverage': abs(covered-1) <= 1e-6,
                               'clippedPolygon': q})
    assert abs(sum(c['coveredAreaInUnitCell'] for c in result)-area(poly)) <= max(1e-5, area(poly)*1e-6)
    return result


def convex_overlap(a, b):
    """Area of intersection of two convex UV polygons; no package dependency."""
    p = np.asarray(b, float)
    signed = np.sum(p[:, 0]*np.roll(p[:, 1], -1)-p[:, 1]*np.roll(p[:, 0], -1))
    sign = 1 if signed >= 0 else -1
    out = [np.asarray(x, float) for x in a]
    for q, r in zip(p, np.roll(p, -1, axis=0)):
        if not out:
            break
        cross = lambda x: sign*((r[0]-q[0])*(x[1]-q[1])-(r[1]-q[1])*(x[0]-q[0]))
        inp, out = out, []
        prev = inp[-1]; dp = cross(prev)
        for now in inp:
            dn = cross(now)
            if (dp >= -1e-10) != (dn >= -1e-10):
                out.append(prev+(now-prev)*(dp/(dp-dn)))
            if dn >= -1e-10:
                out.append(now)
            prev, dp = now, dn
    return area(out)


def overlap_segment(a, b):
    p, q = np.asarray(a, float); r, s = np.asarray(b, float)
    if np.any(np.maximum(np.minimum(p, q), np.minimum(r, s)) >
              np.minimum(np.maximum(p, q), np.maximum(r, s))+1e-5):
        return 0.0
    u, v = q-p, s-r
    length = np.linalg.norm(u)
    if length < 1e-7 or np.linalg.norm(v) < 1e-7:
        return 0.0
    if np.linalg.norm(np.cross(u, v)) > 1e-5*length*np.linalg.norm(v):
        return 0.0
    if np.linalg.norm(np.cross(u, r-p)) > 1e-5*length:
        return 0.0
    u /= length
    low, high = sorted([float(np.dot(r-p, u)), float(np.dot(s-p, u))])
    return max(0.0, min(length, high)-max(0.0, low))


def orient(z):
    return ('upwardHorizontal' if z >= 1-1e-6 else 'downwardHorizontal' if z <= -1+1e-6
            else 'vertical' if abs(z) <= 1e-6 else 'upwardSloped' if z > 0 else 'downwardSloped')


def pak_member(o):
    p = Path(o['source'])
    payload = p.read_bytes()
    assert sha(payload) == o['PAKSha256']
    watched[str(p)] = sha(payload)
    magic, off, n = struct.unpack_from('<4sII', payload)
    assert magic == b'PACK' and n % 64 == 0
    table = payload[off:off+n]
    directory = {table[i:i+56].split(b'\0')[0].decode('ascii').lower():
                 struct.unpack_from('<II', table, i+56) for i in range(0, n, 64)}
    start, size = directory[o['map']]
    bsp = payload[start:start+size]
    assert start == o['memberOffset'] and sha(bsp) == o['bspSha256']
    return bsp


def analyse(o):
    bsp = pak_member(o)
    assert struct.unpack_from('<i', bsp)[0] == 29
    lumps = [struct.unpack_from('<II', bsp, 4+8*i) for i in range(15)]
    def lump(i):
        offset, size = lumps[i]
        assert offset+size <= len(bsp)
        return bsp[offset:offset+size]
    planes, verts, texinfo, faces, edges, surfedges, models = [lump(i) for i in [1, 3, 6, 7, 12, 13, 14]]
    assert len(planes)%20 == len(verts)%12 == len(texinfo)%40 == len(faces)%20 == len(edges)%4 == len(surfedges)%4 == len(models)%80 == 0
    vertices = np.frombuffer(verts, '<f4').reshape(-1, 3).astype(float)
    edgev = np.frombuffer(edges, '<u2').reshape(-1, 2)
    sedges = np.frombuffer(surfedges, '<i4')
    entities = []
    for index, block in enumerate(re.findall(r'\{([^{}]*)\}', lump(0).decode('latin1'))):
        entity = dict(re.findall(r'"((?:[^"\\]|\\.)*)"\s*"((?:[^"\\]|\\.)*)"', block))
        entities.append({'entityIndex': index, **entity})
    model_rows = []
    face_models = collections.defaultdict(list)
    for i in range(len(models)//80):
        vals = struct.unpack_from('<9f11i', models, i*80)
        first, count = vals[-2:]
        assert first >= 0 and count >= 0 and first+count <= len(faces)//20
        for f in range(first, first+count):
            face_models[f].append(i)
        refs = [x for x in entities if x.get('model') == '*'+str(i)]
        model_rows.append({'index': i, 'firstFace': first, 'numFaces': count,
                           'origin': list(vals[6:9]), 'entityReferences': refs})
    selected_infos = {}
    for i in range(len(texinfo)//40):
        vals = struct.unpack_from('<8f2i', texinfo, 40*i)
        if vals[8] == o['slot']:
            assert vals[9] == 0
            selected_infos[i] = vals
    records = []
    for index in range(len(faces)//20):
        plane, side, firstedge, numedges, info = struct.unpack_from('<HHiHH', faces, index*20)
        if info not in selected_infos:
            continue
        assert side in [0, 1] and numedges >= 3 and 0 <= firstedge <= len(sedges)-numedges
        tis = selected_infos[info]
        sv, tv = np.array(tis[:4]), np.array(tis[4:8])
        es = sedges[firstedge:firstedge+numedges]
        assert np.all(np.abs(es) < len(edgev))
        paths = [edgev[abs(int(e))][::1 if e >= 0 else -1].astype(int).tolist() for e in es]
        assert all(a[1] == b[0] for a, b in zip(paths, paths[1:]+paths[:1]))
        ids = [a[0] for a in paths]
        xyz = vertices[ids]
        st = np.c_[xyz@sv[:3]+sv[3], xyz@tv[:3]+tv[3]]
        uv = st/np.array([64, 256])
        pl = np.array(struct.unpack_from('<4f', planes, plane*20))*(1 if side == 0 else -1)
        normal = pl[:3]
        assert np.max(np.abs(xyz@normal-pl[3])) < .02
        assert area(uv) > EPS
        # Convexity and nondegenerate S/T basis on the effective plane.
        turns = [float(np.cross(uv[(j+1)%len(uv)]-uv[j], uv[(j+2)%len(uv)]-uv[(j+1)%len(uv)])) for j in range(len(uv))]
        assert min(turns) >= -1e-5 or max(turns) <= 1e-5
        assert abs(float(np.dot(np.cross(sv[:3], tv[:3]), normal))) > 1e-8
        covered = cells(uv.tolist())
        full = sum(c['isFullCellCoverage'] for c in covered)
        category = ('single_full_uv_cell_face' if len(covered) == 1 and full == 1 else
                    'single_partial_uv_cell_face' if len(covered) == 1 else 'multiple_positive_area_uv_cells_face')
        owners = face_models[index]
        assert len(owners) == 1
        phase = np.mod([sv[3], tv[3]], [64, 256])
        phase[np.isclose(phase, [64, 256], atol=1e-5)] = 0
        canonical = (np.c_[xyz@sv[:3], xyz@tv[:3]]+phase)/np.array([64, 256])
        group_key = tuple([owners[0]]+np.round(pl, 5).tolist()+np.round(sv[:3], 6).tolist()+
                          np.round(tv[:3], 6).tolist()+np.round(phase, 5).tolist())
        records.append({'face': index, 'model': owners[0], 'planeIndex': plane, 'side': side,
                        'effectivePlane': pl.tolist(), 'orientation': orient(float(normal[2])),
                        'texinfo': info, 'textureSlot': o['slot'], 'S': sv.tolist(), 'T': tv.tolist(),
                        'firstSurfedge': firstedge, 'signedSurfedges': es.tolist(),
                        'directedEdgeVertexPairs': paths, 'vertexIndices': ids, 'vertices': xyz.tolist(),
                        'STNativePixels': st.tolist(), 'UVNativeCells': uv.tolist(),
                        'STBounds': [st.min(0).tolist(), st.max(0).tolist()],
                        'UVBounds': [uv.min(0).tolist(), uv.max(0).tolist()],
                        'polygonAreaInUVCells': area(uv), 'positiveAreaCellCount': len(covered),
                        'fullCellCount': full, 'category': category, 'cells': covered,
                        'mappingPhaseModulo64x256': phase.tolist(),
                        'canonicalGroupUV': canonical.tolist(), '_groupKey': group_key})
    assert len(records) == o['faces']
    by_group = collections.defaultdict(list)
    for record in records:
        by_group[record['_groupKey']].append(record)
    groups, all_adjacency = [], []
    for gi, (key, rr) in enumerate(by_group.items()):
        adjacency = []
        graph = {r['face']: set() for r in rr}
        for a, b in itertools.combinations(rr, 2):
            found = None
            pa, pb = np.asarray(a['vertices']), np.asarray(b['vertices'])
            for ai in range(len(pa)):
                for bi in range(len(pb)):
                    length = overlap_segment([pa[ai], pa[(ai+1)%len(pa)]], [pb[bi], pb[(bi+1)%len(pb)]])
                    if length > 1e-5:
                        exact = set(a['directedEdgeVertexPairs'][ai]) == set(b['directedEdgeVertexPairs'][bi])
                        found = {'faces': [a['face'], b['face']], 'aBoundaryEdge': ai, 'bBoundaryEdge': bi,
                                 'sharedLengthWorldUnits': length,
                                 'kind': 'exact_vertex_pair' if exact else 'positive_collinear_overlap'}
                        break
                if found:
                    break
            if found:
                adjacency.append(found); graph[a['face']].add(b['face']); graph[b['face']].add(a['face'])
        components = []
        pending = set(graph)
        while pending:
            todo = [pending.pop()]; component = []
            while todo:
                at = todo.pop(); component.append(at)
                nexts = graph[at]&pending; pending -= nexts; todo += list(nexts)
            components.append(sorted(component))
        canonical_cells = collections.defaultdict(list)
        for record in rr:
            for cell in cells(record['canonicalGroupUV']):
                canonical_cells[tuple(cell['cell'])].append({'face': record['face'], **cell})
        coverage = []
        for cell, pieces in canonical_cells.items():
            overlaps = [convex_overlap(x['clippedPolygon'], y['clippedPolygon']) for x, y in itertools.combinations(pieces, 2)]
            overlap_max = max(overlaps, default=0)
            total = sum(x['coveredAreaInUnitCell'] for x in pieces)
            assert overlap_max <= 1e-5 and total <= 1+1e-5, 'Overlapping BSP polygons: cannot sum coverage as union'
            coverage.append({'cell': list(cell), 'faces': [x['face'] for x in pieces],
                             'unionAreaNoPositiveOverlap': total, 'maxPairOverlap': overlap_max,
                             'fullUVCellCoveredByGroup': abs(total-1) <= 1e-6,
                             'requiresMultipleFacesForCoverage': len(pieces) > 1})
        groups.append({'group': gi, 'model': rr[0]['model'], 'effectivePlane': rr[0]['effectivePlane'],
                       'SVector': rr[0]['S'][:3], 'TVector': rr[0]['T'][:3],
                       'offsetPhaseModulo': rr[0]['mappingPhaseModulo64x256'],
                       'faces': [r['face'] for r in rr], 'adjacentComponents': components,
                       'adjacency': adjacency, 'canonicalCells': coverage})
        all_adjacency += [{'group': gi, **x} for x in adjacency]
    for record in records:
        record.pop('_groupKey')
    counts = dict(collections.Counter(x['category'] for x in records))
    examples = {category: [{'face': r['face'], 'model': r['model'], 'texinfo': r['texinfo'],
                           'S': r['S'], 'T': r['T'], 'UVBounds': r['UVBounds'],
                           'cells': r['positiveAreaCellCount'], 'fullCells': r['fullCellCount']}
                          for r in records if r['category'] == category][:8] for category in counts}
    return {'map': o['map'], 'sourcePAK': o['source'], 'PAKSha256': o['PAKSha256'],
            'BSPMemberOffset': o['memberOffset'], 'BSPSha256': sha(bsp), 'textureSlot': o['slot'],
            'nativeDimensions': [64, 256], 'faceCount': len(records), 'categoryCounts': counts,
            'orientationCounts': dict(collections.Counter(r['orientation'] for r in records)),
            'modelFaceCounts': dict(collections.Counter(r['model'] for r in records)),
            'nativeSubmodelRecordBytes': 80, 'nativeHeadnodesPerSubmodel': 8,
            'modelsWithSelectedFaces': [m for m in model_rows if any(r['model'] == m['index'] for r in records)],
            'examples': examples, 'faceRecords': records, 'coplanarMappingGroups': groups,
            'adjacencyPairCount': len(all_adjacency),
            'multiFaceAdjacentComponentCount': sum(len(c) > 1 for g in groups for c in g['adjacentComponents']),
            'fullUVCellsCoveredWithinGroups': sum(c['fullUVCellCoveredByGroup'] for g in groups for c in g['canonicalCells']),
            'fullUVCellsRequiringMultipleFacePieces': sum(c['fullUVCellCoveredByGroup'] and c['requiresMultipleFacesForCoverage'] for g in groups for c in g['canonicalCells'])}


def main():
    results = [analyse(o) for o in occurrences]
    assert sum(r['faceCount'] for r in results) == 218
    assert all(sha(Path(p).read_bytes()) == digest for p, digest in watched.items())
    out = {'schemaVersion': 1, 'status': 'READ_ONLY_NATIVE_FACE_UV_AND_ADJACENCY_FACTS_NOT_WINDOW_INSTANCE_COUNT',
           'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'nativeIdentity': ID,
           'nativeDimensions': [64, 256], 'inputs': {str(Path(p).relative_to(R)) if R in Path(p).parents else p: v for p, v in watched.items()},
           'script': {'file': str(Path(__file__).relative_to(R)), 'sha256': sha(Path(__file__).read_bytes())},
           'rules': {'ST': 's=dot(S.xyz,vertex)+S.offset; t=dot(T.xyz,vertex)+T.offset. UV=(s/64,t/256), unwrapped.',
                     'cellCoverage': 'Clip actual convex UV face polygon against each integer unit cell; positive area only. Sum equals polygon area. Touching a cell boundary alone is excluded.',
                     'fullSingleFaceCandidate': 'Exactly one positive-area cell and polygon covers unit area within1e-6; this is geometric coverage, not a confirmed whole-window instance.',
                     'adjacency': 'Same model, side-adjusted plane and S/T basis/offset phase modulo64x256. Positive shared boundary length required, exact vertex-pair or collinear segment overlap; point contact excluded.',
                     'unionCoverage': 'Canonical phase removes whole-cell offset translations. Group clipped face pieces are checked for positive-area pair overlap before summing. Full-cell union coverage still does not prove visible/semantic windows.'},
           'maps': results, 'limits': ['No visibility, camera playback, screen area, lighting, occlusion, entity-instance transforms or runtime acceptance measured.',
                     'One BSP face can cover part, all or several repeated texture cells. No BSP face equals one window by definition.',
                     'UV bounding-box cell count is not used as confirmed coverage or a confirmed window count.',
                     'Mapping groups do not merge rotated/mirrored/different-basis parameterizations. Group coverage is compiled geometric evidence only.',
                     'Submodel entity references are retained, but this audit does not expand entity instances or transform geometry into runtime positions.',
                     'No app/engine/asset/model/Git/build changes or model call performed.']}
    p = D/'evidence.json'
    with p.open('x') as f: json.dump(out, f, indent=2); f.write('\n')
    print(json.dumps({'evidenceSha256': sha(p.read_bytes()), 'maps': [{k: r[k] for k in ['map', 'faceCount', 'categoryCounts', 'orientationCounts', 'modelFaceCounts', 'adjacencyPairCount', 'multiFaceAdjacentComponentCount', 'fullUVCellsCoveredWithinGroups', 'fullUVCellsRequiringMultipleFacePieces']} for r in results]}, indent=2))

if __name__ == '__main__':
    main()
