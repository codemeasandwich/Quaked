"""Exact fixed shared-anchor amendment. Geometry only, never RGB interpolation."""
from fractions import Fraction as F


class GuardError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise GuardError(message)


def point(value):
    require(len(value) == 2 and all(type(v) is int or isinstance(v, F) for v in value),
            'Exact integer/rational point required')
    return tuple(F(v) for v in value)


def amend_anchor(curve, axis):
    """Insert +.5 at the shared ordinate, keeping every original integer vertex.

    Progress -1 and 0 already share an ordinate. The plateau therefore covers
    centres -.5 and +.5. The reconnection to unchanged +1 stays within segment0..1.
    """
    require(axis in (0, 1), 'Unknown longitudinal axis')
    points = [point(p) for p in curve]
    require(len(points) >= 3 and all(p[axis].denominator == 1 for p in points),
            'Require unrevised integer-progress curve')
    require(all(b[axis] - a[axis] == 1 for a, b in zip(points, points[1:])),
            'Require consecutive unchanged progress vertices')
    lookup = {p[axis]: p for p in points}
    require(all(F(v) in lookup for v in (-1, 0, 1)), 'Shared anchor neighbourhood missing')
    other = 1 - axis
    anchor = lookup[F(0)][other]
    require(lookup[F(-1)][other] == anchor, 'Negative/positive anchor does not agree')
    delta = lookup[F(1)][other] - anchor
    require(abs(delta) <= 1, 'Original next vertex exceeds three-neighbour bound')
    knot = (F(1, 2), anchor) if axis == 0 else (anchor, F(1, 2))
    at = next(i for i, p in enumerate(points) if p[axis] == 0)
    amended = points[:at+1] + [knot] + points[at+1:]
    require(all(p in amended for p in points), 'Original vertex moved')
    return amended, {'axis': axis, 'anchor': anchor, 'newKnot': knot,
                     'affectedProgressInterval': [F(0), F(1)],
                     'flatCentreInterval': [F(-1, 2), F(1, 2)],
                     'maximumDeviation': abs(delta) / 2,
                     'originalVerticesPreserved': True}


def ordinate(curve, progress, axis):
    p = F(progress)
    for a, b in zip(curve, curve[1:]):
        if a[axis] <= p <= b[axis]:
            t = (p-a[axis])/(b[axis]-a[axis])
            return a[1-axis] + t*(b[1-axis]-a[1-axis])
    raise GuardError('Probe outside source curve')


def core_side(value, boundary, positive):
    """Outer owner receives a centre exactly on this incident interface."""
    return F(value) < boundary if positive else F(value) > boundary


def signed_pixel(index):
    require(type(index) is int and 0 <= index < 512, 'Output pixel out of bounds')
    return index-512 if index >= 464 else index


def source_lookup(owner, x, y):
    """Reviewed C2 integer fields; no lookup can enlarge half-open copy bounds."""
    u, v = signed_pixel(x), signed_pixel(y)
    if owner == 'P':
        return x, y
    if owner == 'X':
        require(-48 <= u < 48, 'X owner escaped collar')
        return 384+u, y
    if owner == 'Y':
        require(-48 <= v < 48, 'Y owner escaped collar')
        return x, 128+v
    require(owner == 'C' and -48 <= u < 48 and -48 <= v < 48, 'C owner escaped corner collar')
    return 384+u, 128+v
