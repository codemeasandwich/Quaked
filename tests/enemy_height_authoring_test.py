import copy
from pathlib import Path
import sys
import unittest
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'tools/texture_sheets'))
from update_enemy_heights import PROFILE
from enemy_height_authoring import pigment_surface, structural_field, author_height
import craft_normals
import numpy as np

POLICY={"reference_size":[64,64],"paint_regions":[{"box":[0,0,64,64]}],"protected_regions":[],
 "pigment":{"red_over_green":1.6,"red_over_blue":1.5,"minimum_red":.12,"padding_texels":1.4,"feather_texels":.5,"reconstruction_texels":6},"features":[]}

class MaterialHeightTests(unittest.TestCase):
 def setUp(self):
  self.base=np.zeros((64,64,3),dtype=float)+[.6,.55,.5]
  self.paint=self.base.copy();self.paint[20:44,20:44]=[.75,.03,.01]
 def test_flat_painted_surface_does_not_acquire_a_trench(self):
  surface,mask=pigment_surface(self.paint,POLICY)
  original=self.base @ np.array([.299,.587,.114])
  self.assertGreater(mask[30,30],.999)
  self.assertLess(np.max(np.abs(surface-original)),1e-6)
  height=author_height(self.paint,PROFILE,recipe=POLICY)
  clean=author_height(self.base,PROFILE,recipe=POLICY)
  self.assertLess(np.max(np.abs(height-clean)),1e-5)
  old=craft_normals.craft(self.paint,PROFILE)[0]
  self.assertGreater(np.ptp(old),.5,'baseline brightness authoring must expose the false relief')
 def test_wound_and_fold_have_independent_depth_through_paint(self):
  recipe=copy.deepcopy(POLICY);recipe['features']=[{'type':'recess','center':[30,30],'radius':[6,6],'depth':-.07},
   {'type':'ridge','points':[[23,39],[39,39]],'width':1.5,'depth':.08}]
  flat=author_height(self.paint,PROFILE,recipe=POLICY);height=author_height(self.paint,PROFILE,recipe=recipe)
  self.assertLess(height[30,30],flat[30,30]-.06)
  self.assertGreater(height[39,30],flat[39,30]+.07)
 def test_declared_wound_is_never_pigment_flattened(self):
  recipe=copy.deepcopy(POLICY);recipe['protected_regions']=[{'box':[26,26,35,35]}]
  corrected,mask=pigment_surface(self.paint,recipe)
  self.assertEqual(mask[30,30],0)
  self.assertAlmostEqual(corrected[30,30],float(self.paint[30,30] @ [.299,.587,.114]))
 def test_unreviewed_red_regions_and_other_models_are_preserved(self):
  recipe=copy.deepcopy(POLICY);recipe['paint_regions']=[{'box':[0,0,10,10]}]
  _,mask=pigment_surface(self.paint,recipe);self.assertEqual(float(mask.sum()),0)
  expected=craft_normals.craft(self.paint,PROFILE)[0]
  np.testing.assert_array_equal(author_height(self.paint,PROFILE,'boss'),expected)
  recipe['paint_regions']=[];np.testing.assert_array_equal(author_height(self.paint,PROFILE,recipe=recipe),expected)
 def test_authoring_never_mutates_colour_pixels(self):
  before=self.paint.copy();author_height(self.paint,PROFILE,recipe=POLICY);np.testing.assert_array_equal(self.paint,before)
 def test_nonconstant_surface_retains_a_broad_fold_under_a_narrow_stain(self):
  yy,xx=np.mgrid[0:64,0:64];surface=.5+.08*xx/64+.03*np.sin(yy*2*np.pi/64)
  rgb=np.stack([surface*1.1,surface,surface*.9],axis=2);painted=rgb.copy();painted[15:49,30:33]=[.8,.03,.01]
  recipe=copy.deepcopy(POLICY);recipe['pigment'].update(padding_texels=.35,feather_texels=.25,reconstruction_texels=3)
  corrected,mask=pigment_surface(painted,recipe);expected=rgb @ [.299,.587,.114]
  self.assertLess(float(np.max(np.abs(corrected[20:44,30:33]-expected[20:44,30:33]))),.012)
  untouched=mask==0;np.testing.assert_array_equal(corrected[untouched],(painted @ [.299,.587,.114])[untouched])
 def test_boundary_adjacent_pigment_never_changes_unreviewed_pixels(self):
  recipe=copy.deepcopy(POLICY);recipe['paint_regions']=[{'box':[0,0,32,64]}]
  painted=self.base.copy();painted[20:44,30:35]=[.75,.03,.01]
  corrected,mask=pigment_surface(painted,recipe)
  self.assertGreater(mask[30,31],.9);self.assertEqual(float(mask[:,32:].sum()),0)
  np.testing.assert_array_equal(corrected[:,32:],(painted @ [.299,.587,.114])[:,32:])
 def test_new_custom_art_requires_reviewed_annotations(self):
  with self.assertRaisesRegex(ValueError,'diffuse changed'):author_height(self.paint,PROFILE,'shambler/custom')
 def test_original_shambler_has_no_custom_anatomy_overrides(self):
  np.testing.assert_array_equal(author_height(self.paint,PROFILE,'shambler'),craft_normals.craft(self.paint,PROFILE)[0])
 def test_structural_units_scale_with_atlas_resolution(self):
  recipe=copy.deepcopy(POLICY);recipe['features']=[{'type':'ridge','points':[[12,24],[50,24]],'width':2,'depth':.05}]
  low=structural_field((64,64),recipe);high=structural_field((128,128),recipe)
  self.assertLess(abs(low[23,30]-high[47,61]),.002)

if __name__=='__main__':unittest.main()
