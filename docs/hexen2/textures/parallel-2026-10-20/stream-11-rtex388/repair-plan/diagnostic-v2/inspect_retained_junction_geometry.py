"""Static exact intersections of retained C2 rank-one paths; no DP or compositor."""
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path

D = Path(__file__).resolve().parent
R = D.parents[6]
source = D / 'runs/actual-v1/result.json'
source_bytes = source.read_bytes()
assert hashlib.sha256(source_bytes).hexdigest() == 'c73841bfaa46f963cff1afce06e877baabbd8656eba96cabd2d142f7ca70877e'
result = json.loads(source_bytes)
candidate = next(row for row in result['candidates'] if row['candidate'] == 'C2')


def signed(value):
    return value - 512 if value >= 464 else value


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


quadrants = []
checks = 0
for sign_x, sign_y in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
    y_name = 'capY' + ('+' if sign_y == 1 else '-')
    x_name = 'capX' + ('+' if sign_x == 1 else '-')
    y_half = 'positiveHalf' if sign_x == 1 else 'negativeHalf'
    x_half = 'positiveHalf' if sign_y == 1 else 'negativeHalf'
    y_path = candidate['caps'][y_name]['suggestions'][0][y_half]
    x_path = candidate['caps'][x_name]['suggestions'][0][x_half]
    a = [(signed(row[0]), signed(row[1])) for row in y_path['lookups']]
    b = [(signed(row[0]), signed(row[1])) for row in x_path['lookups']]
    events = {}
    for index_a, (p, q) in enumerate(zip(a, a[1:])):
        delta_a = (q[0] - p[0], q[1] - p[1])
        for index_b, (v, w) in enumerate(zip(b, b[1:])):
            checks += 1
            delta_b = (w[0] - v[0], w[1] - v[1])
            denominator = cross(delta_a, delta_b)
            if denominator == 0:
                continue
            difference = (v[0] - p[0], v[1] - p[1])
            t = Fraction(cross(difference, delta_b), denominator)
            u = Fraction(cross(difference, delta_a), denominator)
            if not (0 <= t <= 1 and 0 <= u <= 1):
                continue
            point = (Fraction(p[0]) + t * delta_a[0], Fraction(p[1]) + t * delta_a[1])
            if not all(24 <= abs(value) <= 48 for value in point):
                continue
            events[point] = {
                'YcapSegmentIndex': index_a,
                'YcapSegment': [p, q],
                'XcapSegmentIndex': index_b,
                'XcapSegment': [v, w],
                'intersectionRational': [[value.numerator, value.denominator] for value in point],
                'intersectionFloat': [float(value) for value in point],
                'unitCellLowerLeft': [math.floor(value) for value in point],
                'integerNodeIntersection': all(value.denominator == 1 for value in point),
            }
    x_side = 'X' + ('+' if sign_x == 1 else '-')
    y_side = 'Y' + ('+' if sign_y == 1 else '-')
    station_y = 80 if sign_y == 1 else 432
    station_x = 80 if sign_x == 1 else 432
    end_x = next(row for row in candidate['longPaths'][x_side]['lookups'] if row[1] == station_y)
    end_y = next(row for row in candidate['longPaths'][y_side]['lookups'] if row[0] == station_x)
    quadrants.append({
        'quadrant': [sign_x, sign_y],
        'capRanksFixed': [1, 1],
        'capNames': [y_name, x_name],
        'events': list(events.values()),
        'XparentJoinAtExistingLongStation': {
            'destination': end_x[:2],
            'signed': [signed(end_x[0]), signed(end_x[1])],
            'lookup': end_x,
        },
        'YparentJoinAtExistingLongStation': {
            'destination': end_y[:2],
            'signed': [signed(end_y[0]), signed(end_y[1])],
            'lookup': end_y,
        },
    })

assert checks == 8836
assert source.read_bytes() == source_bytes
output = {
    'state': 'Static geometry of retained C2 rank1 suggestions only; no DP/ownership/composite',
    'source': {'file': str(source.relative_to(R)), 'sha256': hashlib.sha256(source_bytes).hexdigest()},
    'quadrants': quadrants,
    'segmentPairChecks': checks,
    'continuationProposal': 'Trim wrong-owner cap tails at true crossings. Correct-owner P/X and P/Y branches join retained long paths at signed stations +/-80, trimming their corner prefixes. Side paths stay inside the original48-wide collar; support is not widened.',
    'newLatticeStates': 0,
    'cumulativeStatesUnchanged': 844800,
    'remaining': 155200,
    'script': {'file': str(Path(__file__).relative_to(R)), 'sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
}
path = D / 'retained-C2-junction-geometry-plan-v1.json'
with path.open('x') as file:
    json.dump(output, file, indent=2)
    file.write('\n')
print(json.dumps(output, indent=2))
