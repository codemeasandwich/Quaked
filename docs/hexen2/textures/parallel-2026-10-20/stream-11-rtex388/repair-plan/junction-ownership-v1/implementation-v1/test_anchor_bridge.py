"""Synthetic source-free fixtures for the exact wrap-centre defect/amendment."""
from fractions import Fraction as F
import unittest
from anchor_bridge import amend_anchor, core_side, ordinate, source_lookup, GuardError


class FixedAnchor(unittest.TestCase):
    def test_actual_defect_geometry_and_strict_amendment_both_axes(self):
        for axis in (0, 1):
            anchor = -41
            curve = [(-1, anchor), (0, anchor), (1, anchor+1), (2, anchor+1)]
            if axis == 1:
                curve = [(b, a) for a, b in curve]
            before = [core_side(F(-81, 2), ordinate(curve, p, axis), False) for p in (F(-1,2), F(1,2))]
            self.assertEqual(before, [True, False])
            amended, receipt = amend_anchor(curve, axis)
            self.assertEqual([core_side(F(-81,2), ordinate(amended,p,axis), False)
                              for p in (F(-1,2), F(1,2))], [True, True])
            self.assertEqual(receipt['maximumDeviation'], F(1,2))

    def test_reflected_axes_signs_slopes_all512_centres(self):
        for axis in (0, 1):
            for positive in (False, True):
                for delta in (-1, 0, 1):
                    anchor = 35 if positive else -41
                    curve = [(-2,anchor),(-1,anchor),(0,anchor),(1,anchor+delta),(2,anchor+delta)]
                    if axis:
                        curve = [(b,a) for a,b in curve]
                    amended, _ = amend_anchor(curve,axis)
                    for index in range(512):
                        centre = F(2*index+1,2)
                        if centre >= 256:
                            centre -= 512
                        left = core_side(centre,ordinate(amended,F(-1,2),axis),positive)
                        right = core_side(centre,ordinate(amended,F(1,2),axis),positive)
                        self.assertEqual(left,right)

    def test_vertices_fixed_and_only_zero_to_one_changes(self):
        original = [(-2,4),(-1,4),(0,4),(1,3),(2,4)]
        amended, receipt = amend_anchor(original,0)
        self.assertEqual(original,[(-2,4),(-1,4),(0,4),(1,3),(2,4)])
        for p in original:
            self.assertIn(tuple(map(F,p)),amended)
        for p in (F(-3,2),F(-1,2),F(0),F(1),F(3,2)):
            self.assertEqual(ordinate(original,p,0),ordinate(amended,p,0))
        for p in (F(0),F(1,4),F(1,2),F(3,4),F(1)):
            self.assertLessEqual(abs(ordinate(original,p,0)-ordinate(amended,p,0)),F(1,2))
        self.assertEqual(receipt['affectedProgressInterval'],[0,1])

    def test_source_coordinate_examples_and_reflected_corner(self):
        self.assertEqual(source_lookup('C',511,471),(383,87))
        self.assertEqual(source_lookup('C',0,471),(384,87))
        self.assertEqual(source_lookup('C',471,511),(343,127))
        self.assertEqual(source_lookup('C',471,0),(343,128))
        self.assertNotEqual(source_lookup('X',0,471),source_lookup('C',0,471))
        self.assertNotEqual(source_lookup('Y',471,0),source_lookup('C',471,0))
        corners = [source_lookup('C',x,y) for y in (511,0) for x in (511,0)]
        self.assertEqual(corners,[(383,127),(384,127),(383,128),(384,128)])
        for owner,x,y in [('C',48,0),('X',48,200),('Y',200,48)]:
            with self.assertRaises(GuardError):
                source_lookup(owner,x,y)

    def test_bad_anchor_repeat_or_moved_vertex_is_rejected(self):
        for curve in [[(-1,1),(0,2),(1,2)], [(-1,2),(0,2),(1,4)],
                      [(-1,2),(0,2),(F(1,2),2),(1,2)]]:
            with self.assertRaises(GuardError):
                amend_anchor(curve,0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
