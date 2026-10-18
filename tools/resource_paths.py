"""Resolve logical resource identities to the sole authored asset tree.

PAK members, generated registries and provenance continue to use their logical
names. Only filesystem boundaries call this helper. The layout is shared with
the JavaScript distribution manifest; there is no legacy-file fallback.
"""
from functools import lru_cache
import json
from pathlib import Path


@lru_cache(maxsize=None)
def _layout(root):
    return json.loads((Path(root) / 'assets/layout.json').read_text())


def resource_path(root, logical):
    """Return a Path, preserving external absolute inputs and non-resource files."""
    root = Path(root).resolve()
    path = Path(logical)
    if path.is_absolute():
        try:
            name = path.relative_to(root).as_posix()
        except ValueError:
            return path
    else:
        name = path.as_posix()
    layout = _layout(str(root))
    target = layout['files'].get(name)
    if target is None:
        for prefix, destination in sorted(layout['prefixes'].items(), key=lambda row: -len(row[0])):
            if name == prefix.rstrip('/') or name.startswith(prefix):
                target = destination.rstrip('/') + name[len(prefix.rstrip('/')):]
                break
    return root / (target if target is not None else name)


def resource_files(root, logical_directory):
    """Yield logical/physical file pairs, including exact relocations outside a tree.

    Exact files relocated into the physical tree from another logical namespace
    retain that namespace and are excluded from a different logical tree. Nested
    prefix destinations are reversed most specifically first (community maps
    remain maps/* even though they physically live inside the game tree).
    """
    root = Path(root).resolve()
    prefix = str(logical_directory).rstrip('/') + '/'
    layout = _layout(str(root))
    reverse = {physical: logical for logical, physical in layout['files'].items()}
    reverse_prefixes = sorted(layout['prefixes'].items(), key=lambda row: -len(row[1]))
    seen = set()
    physical_directory = resource_path(root, logical_directory)
    for path in physical_directory.rglob('*'):
        if not path.is_file():
            continue
        physical = path.relative_to(root).as_posix()
        logical = reverse.get(physical)
        if logical is None:
            for source, destination in reverse_prefixes:
                if physical.startswith(destination):
                    logical = source + physical[len(destination):]
                    break
        if logical is None:
            logical = prefix + path.relative_to(physical_directory).as_posix()
        if logical.startswith(prefix):
            seen.add(logical)
            yield logical, path
    for logical in layout['files']:
        if logical.startswith(prefix) and logical not in seen:
            path = resource_path(root, logical)
            if path.is_file():
                yield logical, path
