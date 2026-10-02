"""Read the supplied FBX 7400 single-mesh export without changing its shape.

Supported deliberately: one mesh/model, polygon-corner UVs/normals, XYZ Euler
rotation, positive uniform scale. Unsupported encodings fail rather than guess.
"""
import struct
import zlib
import numpy as np


def read_mesh(data):
    if data[:23] != b'Kaydara FBX Binary  \x00\x1a\x00' or struct.unpack_from('<I', data, 23)[0] != 7400:
        raise ValueError('Expected supplied binary FBX 7400')
    def prop(offset):
        kind = chr(data[offset]); offset += 1
        scalars = {'Y': ('h', 2), 'C': ('?', 1), 'I': ('i', 4), 'F': ('f', 4), 'D': ('d', 8), 'L': ('q', 8)}
        if kind in scalars:
            fmt, size = scalars[kind]
            return struct.unpack_from('<' + fmt, data, offset)[0], offset + size
        if kind in 'SR':
            size = struct.unpack_from('<I', data, offset)[0]; value = data[offset + 4:offset + 4 + size]
            return value.decode(errors='replace') if kind == 'S' else value, offset + 4 + size
        if kind in 'fdlibc':
            count, encoding, size = struct.unpack_from('<III', data, offset)
            value = data[offset + 12:offset + 12 + size]
            if encoding not in (0, 1): raise ValueError('Unsupported FBX array compression')
            if encoding: value = zlib.decompress(value)
            result = np.frombuffer(value, dtype={'f': '<f4', 'd': '<f8', 'l': '<i8', 'i': '<i4', 'b': 'u1', 'c': 'i1'}[kind])
            if len(result) != count: raise ValueError('Invalid FBX array length')
            return result, offset + 12 + size
        raise ValueError('Unsupported FBX property ' + kind)
    def node(offset):
        end, count, _, size = struct.unpack_from('<IIIB', data, offset)
        if not end: return None, offset + 13
        name = data[offset + 13:offset + 13 + size].decode(); offset += 13 + size
        properties = []
        for _ in range(count): value, offset = prop(offset); properties.append(value)
        children = []
        while offset < end - 13:
            child, offset = node(offset)
            if child: children.append(child)
        return {'name': name, 'p': properties, 'c': children}, end
    roots = []; offset = 27
    while True:
        item, offset = node(offset)
        if item is None: break
        roots.append(item)
    def child(parent, name):
        found = [c for c in parent['c'] if c['name'] == name]
        if len(found) != 1: raise ValueError('Expected one FBX ' + name)
        return found[0]
    root = {'c': roots}; objects = child(root, 'Objects')
    geometry, model = child(objects, 'Geometry'), child(objects, 'Model')
    controls = child(geometry, 'Vertices')['p'][0].reshape(-1, 3)
    polygon_indices = child(geometry, 'PolygonVertexIndex')['p'][0]
    uv_layer, normal_layer = child(geometry, 'LayerElementUV'), child(geometry, 'LayerElementNormal')
    if child(uv_layer, 'MappingInformationType')['p'][0] != 'ByPolygonVertex' or child(uv_layer, 'ReferenceInformationType')['p'][0] != 'IndexToDirect':
        raise ValueError('Unsupported FBX UV layout')
    if child(normal_layer, 'MappingInformationType')['p'][0] != 'ByPolygonVertex' or child(normal_layer, 'ReferenceInformationType')['p'][0] != 'Direct':
        raise ValueError('Unsupported FBX normal layout')
    uv = child(uv_layer, 'UV')['p'][0].reshape(-1, 2)[child(uv_layer, 'UVIndex')['p'][0]]
    normals = child(normal_layer, 'Normals')['p'][0].reshape(-1, 3)
    if len(uv) != len(polygon_indices) or len(normals) != len(uv): raise ValueError('FBX corner counts differ')
    positions = []; triangles = []; first = 0; polygons = 0
    for i, index in enumerate(polygon_indices):
        positions.append(controls[-index - 1 if index < 0 else index])
        if index < 0:
            if i - first < 2: raise ValueError('Degenerate FBX polygon')
            for corner in range(first + 1, i): triangles.extend([first, corner, corner + 1])
            first = i + 1; polygons += 1
    if first != len(polygon_indices): raise ValueError('Unterminated FBX polygon')
    props = {p['p'][0]: p['p'][4:] for p in child(model, 'Properties70')['c'] if p['name'] == 'P'}
    scaling = np.array(props.get('Lcl Scaling', [1, 1, 1]), dtype=float)
    if min(scaling) <= 0 or not np.allclose(scaling, scaling[0]): raise ValueError('Nonuniform FBX authored scale is unsupported')
    angles = np.deg2rad(props.get('Lcl Rotation', [0, 0, 0]))
    rx, ry, rz = angles
    x = np.array([[1, 0, 0], [0, np.cos(rx), -np.sin(rx)], [0, np.sin(rx), np.cos(rx)]])
    y = np.array([[np.cos(ry), 0, np.sin(ry)], [0, 1, 0], [-np.sin(ry), 0, np.cos(ry)]])
    z = np.array([[np.cos(rz), -np.sin(rz), 0], [np.sin(rz), np.cos(rz), 0], [0, 0, 1]])
    rotation = z @ y @ x
    # FBX authored centimetres -> source glTF-equivalent metres. The supplied
    # model's 100 scale cancels .01 units; subsequent runtime fit is uniform.
    positions = np.array(positions) @ rotation.T * scaling[0] * .01
    positions += np.array(props.get('Lcl Translation', [0, 0, 0]), dtype=float) * .01
    normals = normals @ rotation.T
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    return positions, uv, np.array(triangles), normals, {'controlPoints': len(controls), 'polygons': polygons, 'corners': len(uv), 'triangles': len(triangles) // 3}
