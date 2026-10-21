"""Meaningful isolated fixtures for the approved source-only diagnostic, no game builds."""
import io
import itertools
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image
import source_path_diagnostic as d

HERE = Path(__file__).resolve().parent


class Paths(unittest.TestCase):
    def test_minimum_path_matches_exhaustive_oracle_and_true_lex_tie(self):
        for cost in (np.array([[0,1,1],[1,0,1],[1,1,0],[0,0,0.]],float),
                     np.zeros((4,3)),
                     np.array([[1,.2,.7],[.3,.5,.1],[.1,.2,.1],[.8,.1,.2]])):
            for start,end in ((None,None),(1,None),(None,2),(1,2)):
                legal = [p for p in itertools.product(range(3),repeat=4)
                         if all(abs(a-b)<=1 for a,b in zip(p,p[1:]))
                         and (start is None or p[0]==start) and (end is None or p[-1]==end)]
                expected = min(legal,key=lambda p:(sum(float(cost[r,c])for r,c in enumerate(p)),p))
                budget = d.Budget()
                got = d.minimum_path(cost,budget,start,end)
                self.assertEqual(got['columns'],list(expected))
                self.assertAlmostEqual(got['totalCost'],sum(cost[r,c]for r,c in enumerate(expected)),places=14)
                self.assertEqual(budget.used,12)

    def test_unique_zigzag_and_no_escape(self):
        expected = [1,2,1,0,1,2]
        cost = np.full((6,4),10.)
        cost[np.arange(6),expected] = .1
        got = d.minimum_path(cost,d.Budget())
        self.assertEqual(got['columns'],expected)
        for bad in (np.full((2,3),np.nan),np.full((2,3),-1.),np.ones((417,3)),np.ones((2,26))):
            with self.assertRaises(d.DiagnosticError):d.minimum_path(bad,d.Budget())
        with self.assertRaises(d.DiagnosticError):d.minimum_path(np.zeros((3,3)),d.Budget(),True)

    def test_cumulative_budget_is_not_reset_or_extended(self):
        budget = d.Budget(limit=12)
        d.minimum_path(np.ones((2,3)),budget)
        d.minimum_path(np.ones((2,3)),budget)
        with self.assertRaises(d.DiagnosticError):d.minimum_path(np.ones((1,1)),budget)
        self.assertEqual(budget.used,12)
        with self.assertRaises(d.DiagnosticError):d.Budget(limit=d.STATE_LIMIT+1).consume(1)

    def test_side_orientation_and_approved_bounds(self):
        for cx,cy in d.CENTRES:
            for side in ('X+','X-','Y+','Y-'):
                g = d.long_grid(side,cx,cy)
                self.assertEqual(g.destination.shape,(416,25,2))
                self.assertTrue(np.array_equal(g.destination,g.owner_a))
                shift = g.owner_b-g.owner_a
                expected = [cx-(512 if side=='X-' else 0),0] if side.startswith('X') else [0,cy-(512 if side=='Y-' else 0)]
                self.assertTrue(np.all(shift==expected))
                self.assertTrue(np.all((g.owner_b>=1)&(g.owner_b<=510)))
        with self.assertRaises(d.DiagnosticError):d.long_grid('X+',500,256)
        with self.assertRaises(d.DiagnosticError):d.long_grid('Z+',256,256)

    def test_cap_anchor_pairing_is_shared_in_both_orientations(self):
        rgb = np.full((512,512,3),80,dtype=np.uint8)
        grad = d.luminance_gradient(rgb)
        for side in ('capY+','capY-','capX+','capX-'):
            budget = d.Budget()
            grid = d.cap_grid(side,128,384)
            result,_ = d.cap_suggestions(rgb,grad,grid,budget)
            self.assertEqual(budget.used,60000)
            self.assertEqual(result['evaluatedAnchorPositions'],25)
            self.assertEqual(len(result['suggestions']),3)
            self.assertEqual([v['anchorIndex']for v in result['suggestions']],[0,1,2])
            for option in result['suggestions']:
                self.assertEqual(option['negativeHalf']['columns'][-1],option['positiveHalf']['columns'][0])
                left=option['negativeHalf']['lookups'][-1];right=option['positiveHalf']['lookups'][0]
                expected=[1,0]if side.startswith('capY')else[0,1]
                self.assertEqual([right[4+k]-left[4+k]for k in range(2)],expected)
                self.assertTrue(option['sharedAnchorAdjacentSourceCells'])

    def test_cost_uses_actual_source_pixels_and_neighbourhoods(self):
        rgb = np.zeros((512,512,3),dtype=np.uint8)
        rgb[:,280:305] = 255
        g=d.long_grid('X+',256,256)
        grad=d.luminance_gradient(rgb)
        cost=d.grid_cost(rgb,grad,g)
        # At state x30, A is black and B x286 is white, both neighbourhoods locally flat.
        self.assertEqual(float(cost[10,6]),1.)
        self.assertEqual(float(cost[10,0]),1.25)  # donor x280 lies at its hard source boundary
        row=d.path_record(g,cost,d.minimum_path(cost,d.Budget()))['lookups'][0]
        ax,ay,bx,by=row[2:6]
        expected=np.abs(rgb[ay,ax].astype(float)-rgb[by,bx]).mean()/255+.25*max(grad[ay,ax],grad[by,bx])
        self.assertEqual(row[-1],expected)

    def test_no_composite_unmarked_evidence_is_exact_source_crops(self):
        yy,xx=np.mgrid[:512,:512]
        rgb=np.stack((xx%256,yy%256,(xx+yy)%256),2).astype(np.uint8)
        g=d.long_grid('X+',384,128)
        cost=d.grid_cost(rgb,d.luminance_gradient(rgb),g)
        record=d.path_record(g,cost,d.minimum_path(cost,d.Budget()))
        payload,meta=d.pair_evidence(Image.fromarray(rgb),g,[record['lookups']],False)
        im=Image.open(io.BytesIO(payload)).convert('RGB')
        for key,origin in zip(('A_sourceRect','B_sourceRect'),meta['cropDisplayOrigins']):
            x0,y0,x1,y1=meta[key];ox,oy=origin
            self.assertTrue(np.array_equal(np.asarray(im.crop((ox,oy,ox+x1-x0,oy+y1-y0))),rgb[y0:y1,x0:x1]))
        marked,_=d.pair_evidence(Image.fromarray(rgb),g,[record['lookups']],True)
        self.assertNotEqual(marked,payload)

    def test_approval_rejects_unreviewed_centres_or_wider_support(self):
        good={'verdict':'PASS fixture','plan':{'sha256':d.PLAN_SHA},'parameters':
              {'centres':[list(c)for c in d.CENTRES],'wrapCollarMasterPixels':48,
               'protectedCentralRectangle':[48,48,464,464],'capAnchorsMaximum':25,
               'maximumLatticeStates':1000000}}
        d.validate_approval(good)
        for key,value in [('centres',[[128,128]]),('wrapCollarMasterPixels',49),('maximumLatticeStates',1000001)]:
            bad=json.loads(json.dumps(good));bad['parameters'][key]=value
            with self.assertRaises(d.DiagnosticError):d.validate_approval(bad)


class SourceCustody(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='fixture-',dir=HERE)
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.expected={}
        for i in range(80):
            p=self.root/('input-'+str(i)+'.txt');p.write_text('retained fixture '+str(i))
            self.expected[p.name]=d.sha(p.read_bytes())
        self.snapshot=d.Snapshot(self.root,self.expected)
        self.parent=self.root/'outputs';self.parent.mkdir()

    def test_first_observation_is_not_replaced_on_changed_reread(self):
        before=dict(self.snapshot.first)
        (self.root/'input-3.txt').write_text('changed actual bytes')
        with self.assertRaises(d.DiagnosticError):self.snapshot.read('input-3.txt')
        with self.assertRaises(d.DiagnosticError):self.snapshot.verify()
        self.assertEqual(self.snapshot.first,before)

    def test_source_and_path_guards(self):
        with self.assertRaises(d.DiagnosticError):d.Snapshot(self.root,{'../escape':'0'*64})
        with self.assertRaises(d.DiagnosticError):d.Snapshot(self.root,{'input-1.txt':'0'*64})
        (self.root/'link.txt').symlink_to(self.root/'input-1.txt')
        with self.assertRaises(d.DiagnosticError):d.Snapshot(self.root,{'link.txt':self.expected['input-1.txt']})

    def test_publication_preserves_existing_output_and_refuses_bad_name(self):
        p=self.parent/'existing';p.mkdir();(p/'keep').write_text('keep')
        with self.assertRaises(d.DiagnosticError):d.publish_outputs(self.snapshot,self.parent,'existing',{}, {})
        self.assertEqual((p/'keep').read_text(),'keep')
        (self.parent/'linked').symlink_to(p)
        with self.assertRaises(d.DiagnosticError):d.publish_outputs(self.snapshot,self.parent,'linked',{}, {})
        with self.assertRaises(d.DiagnosticError):d.publish_outputs(self.snapshot,self.parent,'../escape',{}, {})
        with self.assertRaises(d.DiagnosticError):d.publish_outputs(self.snapshot,self.parent,'bad-file',{'../escape.png':b'x'}, {})
        self.assertFalse((self.parent/'bad-file').exists())

    def test_changed_input_before_publication_creates_no_output(self):
        (self.root/'input-8.txt').write_text('changed')
        with self.assertRaises(d.DiagnosticError):d.publish_outputs(self.snapshot,self.parent,'rejected',{}, {})
        self.assertFalse((self.parent/'rejected').exists())

    def test_changed_input_during_publication_retains_failure_without_result(self):
        original=self.snapshot.verify;calls=0
        def change_on_second_check():
            nonlocal calls
            calls+=1
            if calls==2:(self.root/'input-2.txt').write_text('changed during publication')
            return original()
        with patch.object(self.snapshot,'verify',side_effect=change_on_second_check):
            with self.assertRaises(d.DiagnosticError):
                d.publish_outputs(self.snapshot,self.parent,'partial',{'evidence.png':b'fixture-bytes'}, {'status':'fixture'})
        output=self.parent/'partial'
        self.assertTrue((output/'failure.json').is_file())
        self.assertFalse((output/'result.json').exists())

    def test_success_receipt_binds_unchanged80_and_exact_payload(self):
        before=dict(self.snapshot.first)
        output=d.publish_outputs(self.snapshot,self.parent,'ok',{'evidence.png':b'fixture-bytes'}, {'status':'fixture-only'})
        result=json.loads((output/'result.json').read_text())
        self.assertTrue(result['allFirstInputsRecheckedExactBeforeAndAfter'])
        self.assertEqual(result['firstInputHashes'],before)
        self.assertEqual(len(before),80)
        self.assertEqual((output/'evidence.png').read_bytes(),b'fixture-bytes')
        self.assertTrue(self.snapshot.verify())


if __name__=='__main__':unittest.main(verbosity=2)
