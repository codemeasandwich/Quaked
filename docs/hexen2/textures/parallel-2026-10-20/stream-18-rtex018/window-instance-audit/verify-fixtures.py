"""Manual geometric oracles for audit clipping/overlap; no BSP or engine writes."""
from pathlib import Path
import importlib.util, json, hashlib
D = Path(__file__).parent
spec = importlib.util.spec_from_file_location('window_audit', D/'audit.py')
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
cases = []
for label, polygon, expected_count, expected_area, expected_full in [
    ('one full cell', [[0,0],[1,0],[1,1],[0,1]], 1, 1, 1),
    ('three full cells', [[15,-1],[18,-1],[18,0],[15,0]], 3, 3, 3),
    ('thin three-cell upper fragment', [[15,-.125],[18,-.125],[18,0],[15,0]], 3, .375, 0),
    ('remaining three-cell lower fragment', [[15,-1],[18,-1],[18,-.125],[15,-.125]], 3, 2.625, 0),
    ('triangle touches but does not cover next cell', [[0,0],[1,0],[0,1]], 1, .5, 0),
    ('negative-index partial cell', [[-1,-1],[0,-1],[0,-.5],[-1,-.5]], 1, .5, 0),
]:
    out = a.cells(polygon)
    assert len(out) == expected_count
    assert abs(sum(x['coveredAreaInUnitCell'] for x in out)-expected_area) < 1e-10
    assert sum(x['isFullCellCoverage'] for x in out) == expected_full
    cases.append({'case': label, 'manualOraclePassed': True})
assert abs(a.convex_overlap([[0,0],[1,0],[1,1],[0,1]], [[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5]])-.25) < 1e-10
assert a.convex_overlap([[0,0],[1,0],[1,1],[0,1]], [[1,0],[2,0],[2,1],[1,1]]) == 0
assert abs(a.overlap_segment([[0,0,0],[2,0,0]], [[1,0,0],[3,0,0]])-1) < 1e-10
assert a.overlap_segment([[0,0,0],[1,0,0]], [[1,0,0],[2,0,0]]) == 0
assert a.overlap_segment([[0,0,0],[2,0,0]], [[0,1,0],[2,1,0]]) == 0
result = {'status': 'PASS six manual clipping oracles plus overlap/positive-length adjacency fixtures',
          'cases': cases, 'auditScriptSha256': hashlib.sha256((D/'audit.py').read_bytes()).hexdigest(),
          'fixtureScriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'limits': 'Focused audit math checks, not independent BSP interpretation or runtime/window-visibility proof.'}
with (D/'fixtures.json').open('x') as f:
    json.dump(result, f, indent=2); f.write('\n')
print(result['status'])
