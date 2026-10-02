#!/usr/bin/env python3
"""Faithfully extract the supplied meshes into the existing alias draw path.

Requires numpy. Run with Codex's bundled Python or another Python with numpy.
Source archives remain untouched. Only the shotgun-shell mesh is read from the
Weapon Pack. Native MDLs supply independent held/pickup fits and rigid motion.
"""
import hashlib
import json
import struct
import zipfile
import io
from pathlib import Path

import numpy as np
from fbx_mesh import read_mesh

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'newer/weapons'
SOURCES = {
    'supershotgun': ('supershotgun.zip', ['v_shot2', 'g_shot'], [1, -3, 2]),
    'supernailgun': ('supernailgun2.zip', ['v_nail2', 'g_nail2'], [1, -3, 2]),
    'grenadelauncher': ('grenadelauncher.zip', ['v_rock', 'g_rock'], [3, 1, 2]),
    'rocketlauncher': ('rocketlauncher.zip', ['v_rock2', 'g_rock2'], [1, -3, 2]),
    'thunderbolt': ('thuderbolt.zip', ['v_light', 'g_light'], [-1, 3, 2]),
    'shell': ('weapon_pack.zip', [], [1, 2, 3]),
}

# Owner-reviewed colour/material corrections. Textures remain byte-identical;
# the renderer applies these UV-scoped styles and samples the native MDL skin.
STYLES = {
    'supernailgun': {
        # Mild barrel-only hue balance. Preserve receiver bronze and source
        # brightness/detail; the owner explicitly rejected whole-body recolour.
        'grading': [
            {'rect': [0.16210, 0.40372, 0.41618, 0.60428], 'balance': [0.96, 0.99, 1.08], 'gain': 1.0, 'contrast': 1.0, 'saturation': 1.0},
        ],
    },
    'supershotgun': {
        'grading': [
            {'rect': [0.0004, 0.0004, 0.1950, 0.6271], 'balance': [0.94, 0.98, 1.14], 'gain': 0.74, 'contrast': 1.08, 'saturation': 0.85},
            {'rect': [0.0004, 0.6278, 0.6271, 0.8225], 'balance': [0.94, 0.98, 1.14], 'gain': 0.74, 'contrast': 1.08, 'saturation': 0.85},
        ],
    },
    'thunderbolt': {
        'palette': [{'rect': [0, 0, 1, 1], 'chroma': 'blue', 'tint': [43, 29, 19], 'gain': 0.35}],
        'originalWrap': {
            'donorRect': [0.00068150, 0.46755749, 0.13951740, 0.66392350],
            'nativeRects': {
                'v_light': [32.5 / 308, 44.5 / 162, 99.5 / 308, 144.5 / 162],
                'g_light': [109.5 / 308, 42.5 / 144, 147.5 / 308, 114.5 / 144],
            },
            'swapAxes': True, 'opacity': 0.70, 'suppressEmission': True,
        },
    },
}


def native_models():
    data = (ROOT / 'pak0.pak').read_bytes()
    start, length = struct.unpack_from('<ii', data, 4)
    result = {}
    for off in range(start, start + length, 64):
        name, pos, size = struct.unpack_from('<56sii', data, off)
        result[name.split(b'\0')[0].decode()] = data[pos:pos + size]
    return result


def native_poses(data):
    scale = np.array(struct.unpack_from('<3f', data, 8))
    origin = np.array(struct.unpack_from('<3f', data, 20))
    skins, width, height, verts, tris, frames = struct.unpack_from('<6i', data, 48)
    off = 84
    for _ in range(skins):
        kind, = struct.unpack_from('<i', data, off); off += 4
        if kind != 0:
            raise ValueError('Grouped skins need an explicit importer extension')
        off += width * height
    off += verts * 12 + tris * 16
    result = []
    for _ in range(frames):
        kind, = struct.unpack_from('<i', data, off); off += 4
        if kind != 0:
            raise ValueError('Grouped poses need an explicit importer extension')
        off += 24
        points = np.frombuffer(data, dtype=np.uint8, count=verts * 4, offset=off).reshape(-1, 4)[:, :3]
        result.append(points * scale + origin)
        off += verts * 4
    return result


def weapon_vertices(data, name, rest):
    # The view MDLs park their separate muzzle-flash polygons behind the eye
    # at rest. They are not the gun's physical dimensions. The axe is not an
    # imported role; it always uses the complete original mesh and skin.
    skins, width, height, count, tris = struct.unpack_from('<5i', data, 48)
    off = 84 + skins * (4 + width * height) + count * 12
    triangles = np.frombuffer(data, dtype='<i4', count=tris * 4, offset=off).reshape(-1, 4)[:, 1:]
    parent = list(range(count))
    def root(i):
        while parent[i] != i: i = parent[i]
        return i
    for tri in triangles:
        for i in tri[1:]: parent[root(int(i))] = root(int(tri[0]))
    components = {}
    for i in range(count): components.setdefault(root(i), []).append(i)
    excluded = []
    for ids in components.values():
        if name.startswith('v_') and rest[ids].max(0)[0] < 0: excluded.extend(ids)
    return [i for i in range(count) if i not in excluded], excluded


def load_source(path):
    if path.suffix == '.zip':
        archive = zipfile.ZipFile(path)
        doc = json.loads(archive.read('scene.gltf'))
        return doc, archive.read, [archive.read(b['uri']) for b in doc['buffers']]
    data = path.read_bytes()
    size, = struct.unpack_from('<I', data, 12)
    doc = json.loads(data[20:20 + size])
    off = 20 + size
    length, = struct.unpack_from('<I', data, off)
    return doc, None, [data[off + 8:off + 8 + length]]


def accessor(doc, buffers, index):
    a = doc['accessors'][index]; v = doc['bufferViews'][a['bufferView']]
    dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]
    columns = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    stride = v.get('byteStride', np.dtype(dtype).itemsize * columns)
    return np.ndarray((a['count'], columns), dtype=dtype, buffer=buffers[v['buffer']],
                      offset=v.get('byteOffset', 0) + a.get('byteOffset', 0), strides=(stride, np.dtype(dtype).itemsize)).copy()


def extract(doc, buffers, wanted=None):
    parts = []
    def visit(index, parent):
        node = doc['nodes'][index]
        if any(k in node for k in ['rotation', 'translation', 'scale']):
            raise ValueError('TRS source needs an explicit importer extension')
        matrix = parent @ np.array(node.get('matrix', np.eye(4).T.flatten())).reshape(4, 4).T
        if 'mesh' in node and (wanted is None or node.get('name') == wanted):
            for p in doc['meshes'][node['mesh']]['primitives']:
                if p.get('mode', 4) != 4: raise ValueError('Only triangle primitives supported')
                xyz = accessor(doc, buffers, p['attributes']['POSITION'])
                xyz = (matrix @ np.column_stack([xyz, np.ones(len(xyz))]).T).T[:, :3]
                parts.append((xyz, accessor(doc, buffers, p['attributes']['TEXCOORD_0']),
                              accessor(doc, buffers, p['indices']).flatten(), p['material']))
        for child in node.get('children', []): visit(child, matrix)
    for node in doc['scenes'][doc.get('scene', 0)]['nodes']: visit(node, np.eye(4))
    if len(parts) != 1: raise ValueError(f'Expected one selected primitive, got {len(parts)}')
    return parts[0]


def fit(points, target):
    lo, hi = points.min(0), points.max(0)
    lower, upper = target.min(0), target.max(0)
    scale = (upper - lower) / (hi - lo)
    offset = lower - lo * scale
    return points * scale + offset, {'scale': scale.tolist(), 'offset': offset.tolist(),
                                   'nativeMin': lower.tolist(), 'nativeMax': upper.tolist()}


def fit_uniform(points, target, held=False):
    lo, hi = points.min(0), points.max(0)
    lower, upper = target.min(0), target.max(0)
    scale = float((upper[0] - lower[0]) / (hi[0] - lo[0]))
    offset = (lower + upper) / 2 - (lo + hi) / 2 * scale
    fitted = points * scale + offset
    pitch = 8.0 if held else 0.0
    angle = np.deg2rad(pitch)
    rotation = np.array([[np.cos(angle), 0, -np.sin(angle)], [0, 1, 0], [np.sin(angle), 0, np.cos(angle)]])
    # Held placement only: bring the model closer to the camera to expose less
    # receiver through perspective; preserve the complete supplied shape.
    translation = np.array([-7., 0., 0.]) if held else np.zeros(3)
    fitted = fitted @ rotation.T + translation
    return fitted, {'fitKind': 'uniform-source-shape', 'uniformScale': scale, 'offset': offset.tolist(),
                    'pitchUpDegrees': pitch, 'viewTranslation': translation.tolist(),
                    'nativeMin': lower.tolist(), 'nativeMax': upper.tolist()}


def supernail_rotor(points, indices, calibration, pose_count):
    # Recover the four disconnected closed barrels by welded source topology.
    # The common rear ring and central guide are separate, stationary parts.
    coordinates, welded = np.unique(np.round(points, 6), axis=0, return_inverse=True)
    parent = list(range(len(coordinates)))
    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for tri in indices.reshape(-1, 3):
        for i in tri[1:]: parent[root(int(welded[i]))] = root(int(welded[tri[0]]))
    parts = {}
    for i, vertex in enumerate(welded): parts.setdefault(root(int(vertex)), []).append(i)
    barrels = [ids for ids in parts.values() if points[ids].min(0)[0] > 0 and np.ptp(points[ids], axis=0)[0] > 5]
    if len(barrels) != 4 or any(len(ids) != 544 for ids in barrels) or pose_count != 9:
        raise ValueError('Unexpected supplied super nailgun barrel topology/animation')
    centers = np.array([(points[ids].min(0) + points[ids].max(0)) / 2 for ids in barrels])
    if not np.allclose(centers[:, 1:].mean(0), 0, atol=1e-6):
        raise ValueError('Super nailgun barrels do not share the authored X centreline')
    vertices = sorted(i for ids in barrels for i in ids)
    mask = np.zeros(len(points), dtype=bool); mask[vertices] = True
    if any(mask[tri].any() != mask[tri].all() for tri in indices.reshape(-1, 3)):
        raise ValueError('Rotor and receiver share triangles')
    angle = np.deg2rad(calibration['pitchUpDegrees'])
    rotation = np.array([[np.cos(angle), 0, -np.sin(angle)], [0, 1, 0], [np.sin(angle), 0, np.cos(angle)]])
    pivot = np.array(calibration['offset']) @ rotation.T + calibration['viewTranslation']
    return {'vertices': vertices, 'axis': (rotation @ np.array([1., 0., 0.])).tolist(),
            'pivot': pivot.tolist(), 'angles': [-i * np.pi / 4 for i in range(pose_count)]}


def rotor_pose(values, rotor, angle, normals=False):
    result = values.copy(); ids = rotor['vertices']; axis = np.array(rotor['axis'])
    pivot = np.zeros(3) if normals else np.array(rotor['pivot'])
    relative = values[ids] - pivot
    result[ids] = (relative * np.cos(angle) + np.cross(axis, relative) * np.sin(angle)
                   + np.outer(relative @ axis, axis) * (1 - np.cos(angle)) + pivot)
    return result


def fit_grenade_barrel(points, rest):
    # Native held GL has a tube, no hanging grip. Calibrate against its barrel
    # rings instead of allowing the donor grip to shrink/advance the tube.
    rear = rest[[0, 1, 2, 14, 15, 17]].mean(0)
    middle = rest[[4, 5, 8, 9, 11, 16]]
    front = rest[[3, 6, 7, 10, 12, 18]].mean(0)
    axis = front - rear
    forward = axis / np.linalg.norm(axis)
    side = np.cross([0, 0, 1], forward); side /= np.linalg.norm(side)
    up = np.cross(forward, side)
    rotation = np.column_stack([forward, side, up])
    source_rear_x, source_middle_x, source_front_x = -3.76748756, 1.69056016, 6.53325930
    def ring(x):
        selected = points[(np.abs(points[:, 0] - x) < 0.0001) & (np.hypot(points[:, 1], points[:, 2]) < 1.3)]
        if len(selected) < 6: raise ValueError('Missing grenade barrel calibration ring')
        return selected
    source_rear, source_middle = ring(source_rear_x), ring(source_middle_x)
    source_center = (source_rear.min(0) + source_rear.max(0)) / 2
    target_section = (middle - middle.mean(0)) @ rotation
    scale = np.array([np.linalg.norm(axis) / (source_front_x - source_rear_x),
                      np.ptp(target_section[:, 1]) / np.ptp(source_middle[:, 1]),
                      np.ptp(target_section[:, 2]) / np.ptp(source_middle[:, 2])])
    fitted = ((points - source_center) * scale) @ rotation.T + rear
    return fitted, {'fitKind': 'barrel-rings', 'scale': scale.tolist(), 'offset': rear.tolist(),
                    'rotation': rotation.flatten().tolist(), 'sourceRear': source_center.tolist(),
                    'sourceMiddleX': source_middle_x, 'sourceFrontX': source_front_x,
                    'nativeRear': rear.tolist(), 'nativeFront': front.tolist(),
                    'nativeSectionSize': np.ptp(target_section, axis=0).tolist(),
                    'nativeMin': rest[:19].min(0).tolist(), 'nativeMax': rest[:19].max(0).tolist()}


def rigid_pose(points, rest, pose):
    # Kabsch: same native vertex identities, no per-frame stretching of art.
    a, b = rest - rest.mean(0), pose - pose.mean(0)
    u, _, vt = np.linalg.svd(a.T @ b)
    rotation = u @ vt
    if np.linalg.det(rotation) < 0:
        u[:, -1] *= -1; rotation = u @ vt
    return (points - rest.mean(0)) @ rotation + pose.mean(0)


def rigid_normals(normals, rest, pose):
    a, b = rest - rest.mean(0), pose - pose.mean(0)
    u, _, vt = np.linalg.svd(a.T @ b); rotation = u @ vt
    if np.linalg.det(rotation) < 0: u[:, -1] *= -1; rotation = u @ vt
    return normals @ rotation


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    native = native_models()
    manifest = {'version': 9, 'models': {}, 'sources': {}}
    for key, (filename, models, axes) in SOURCES.items():
        path = ROOT / filename
        authored_normals = None
        if key == 'supernailgun':
            # Directly port the new source FBX, not the earlier deformed fit.
            outer = zipfile.ZipFile(path)
            nested = zipfile.ZipFile(io.BytesIO(outer.read('source/supernailgun.zip')))
            xyz, uv, indices, authored_normals, fbx_info = read_mesh(nested.read('supernailgun.fbx'))
            # Preserve original creator/license provenance from the earlier
            # download, whose control points/UVs match this source export.
            doc, _, _ = load_source(ROOT / 'supernailgun.zip')
            read = lambda name: zipfile.ZipFile(ROOT / 'supernailgun.zip').read(name)
            material = 0
        else:
            doc, read, buffers = load_source(path)
            xyz, uv, indices, material = extract(doc, buffers, 'shotgun_shell_bullets_0' if key == 'shell' else None)
        xyz = np.column_stack([xyz[:, abs(a) - 1] * (1 if a > 0 else -1) for a in axes])
        if authored_normals is not None:
            authored_normals = np.column_stack([authored_normals[:, abs(a) - 1] * (1 if a > 0 else -1) for a in axes])
        directory = OUT / key; directory.mkdir(exist_ok=True)
        pbr = doc['materials'][material]['pbrMetallicRoughness']
        image = doc['images'][doc['textures'][pbr['baseColorTexture']['index']]['source']]
        if key == 'supernailgun': texture = outer.read('textures/albedo.png')
        elif 'uri' in image: texture = read(image['uri'])
        else:
            v = doc['bufferViews'][image['bufferView']]; texture = buffers[v['buffer']][v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        (directory / 'diffuse.png').write_bytes(texture)
        maps = {'diffuse': 'diffuse.png'}
        for kind, field in [('normal', 'normalTexture'), ('luma', 'emissiveTexture')]:
            slot = doc['materials'][material].get(field)
            if slot:
                image = doc['images'][doc['textures'][slot['index']]['source']]
                if key == 'supernailgun' and kind == 'normal': texture = outer.read('textures/normal.png')
                elif 'uri' in image: texture = read(image['uri'])
                else:
                    v = doc['bufferViews'][image['bufferView']]; texture = buffers[v['buffer']][v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
                (directory / (kind + '.png')).write_bytes(texture)
                maps[kind] = kind + '.png'
        record = {'archive': filename, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                  'metadata': doc['asset']['extras'], 'axes': axes, 'vertices': len(xyz),
                  'rotationYDegrees': 0,
                  'triangles': len(indices) // 3, 'maps': maps, 'material': {
                      'baseColorFactor': pbr.get('baseColorFactor', [1, 1, 1, 1]),
                      'emissiveFactor': doc['materials'][material].get('emissiveFactor', [0, 0, 0]),
                      'doubleSided': doc['materials'][material].get('doubleSided', False)},
                  'selectedMesh': 'shotgun_shell_bullets_0' if key == 'shell' else doc['meshes'][0]['name']}
        if key in STYLES: record['material']['style'] = STYLES[key]
        if key == 'supernailgun':
            record['geometrySource'] = 'source/supernailgun.zip!supernailgun.fbx'
            record['provenanceSource'] = 'supernailgun.zip!license.txt and asset metadata'
            record['fbx'] = fbx_info; record['textureFlipY'] = True
            record['material']['normalFlipGreen'] = True
        manifest['sources'][key] = record
        (directory / 'source.json').write_text(json.dumps(record, indent=2) + '\n')
        if read: (directory / 'license.txt').write_bytes(read('license.txt'))
        for model in models:
            original = native['progs/' + model + '.mdl']
            poses = native_poses(original)
            selected, excluded = weapon_vertices(original, model, poses[0])
            if key == 'supernailgun': fitted, calibration = fit_uniform(xyz, poses[0][selected], model == 'v_nail2')
            else: fitted, calibration = fit_grenade_barrel(xyz, poses[0]) if model == 'v_rock' else fit(xyz, poses[0][selected])
            if model == 'v_rock2':
                # Owner-requested held silhouette refinement: move toward the
                # eye without changing size, orientation or pickup placement.
                fitted += np.array([-3.0, 0.0, 0.0])
                calibration['viewOffset'] = [-3.0, 0.0, 0.0]
            output = {'poses': [np.round(rigid_pose(fitted, poses[0][selected], p[selected]), 6).flatten().tolist() for p in poses],
                      'uv': np.round(uv, 7).flatten().tolist(), 'indices': indices.tolist()}
            if authored_normals is not None:
                angle = np.deg2rad(calibration['pitchUpDegrees'])
                rotation = np.array([[np.cos(angle), 0, -np.sin(angle)], [0, 1, 0], [np.sin(angle), 0, np.cos(angle)]])
                normal_rest = authored_normals @ rotation.T
                output['normals'] = [np.round(rigid_normals(normal_rest, poses[0][selected], p[selected]), 7).flatten().tolist() for p in poses]
            if model == 'v_nail2':
                rotor = supernail_rotor(xyz, indices, calibration, len(poses))
                output['rotor'] = rotor
                output['poses'] = [np.round(rotor_pose(fitted, rotor, angle), 6).flatten().tolist() for angle in rotor['angles']]
                output['normals'] = [np.round(rotor_pose(normal_rest, rotor, angle, True), 7).flatten().tolist() for angle in rotor['angles']]
                calibration['animationKind'] = 'barrel-rotor'
            (OUT / (model + '.json')).write_text(json.dumps(output, separators=(',', ':')) + '\n')
            residuals = [float(np.sqrt(np.mean(np.sum((rigid_pose(poses[0][selected], poses[0][selected], p[selected]) - p[selected]) ** 2, axis=1)))) for p in poses]
            manifest['models'][model] = {'source': key, **calibration, 'poses': len(poses),
                                         'nativePoseRigidRms': residuals, 'excludedNativeVertices': excluded}
        if key == 'shell':
            xyz -= (xyz.min(0) + xyz.max(0)) / 2
            # A 2.4 unit casing, radius .514 units; local long axis is Y.
            xyz *= 2.4 / np.ptp(xyz, axis=0).max()
            (OUT / 'shell.json').write_text(json.dumps({'poses': [np.round(xyz, 7).flatten().tolist()], 'uv': uv.flatten().tolist(), 'indices': indices.tolist()}, separators=(',', ':')) + '\n')
    (OUT / 'index.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print('Imported 10 weapon roles and only the shotgun-shell mesh; axe stays original.')


if __name__ == '__main__': main()
