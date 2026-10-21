"""Source-free public and independent mathematical guard fixtures; no actual DP."""
import copy
from fractions import Fraction as F
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.dont_write_bytecode=True
import numpy as np
from anchor_bridge import GuardError, amend_anchor
from atlas_geometry import (JUNCTIONS, OWNERS, segment_event, first_mutual_intersection,
    clip_progress, validate_graph, transition, rasterize, validate_raster, connected_labels)
import junction_diagnostic as jd


def line(a,b):
    dx,dy=b[0]-a[0],b[1]-a[1];count=max(abs(dx),abs(dy))
    assert count and (dx==0 or dy==0 or abs(dx)==abs(dy))
    return [(a[0]+dx*i//count,a[1]+dy*i//count) for i in range(count+1)]


def fixture_arcs():
    specs=[('cy+',('C','X'),(-32,32),(32,32)),('cy-',('C','X'),(-32,-32),(32,-32)),
      ('cx+',('C','Y'),(32,-32),(32,32)),('cx-',('C','Y'),(-32,-32),(-32,32)),
      ('lx+',('P','X'),(32,32),(32,480)),('lx-',('P','X'),(-32,32),(-32,480)),
      ('ly+',('P','Y'),(32,32),(480,32)),('ly-',('P','Y'),(32,-32),(480,-32))]
    return [{'id':name,'owners':owners,'points':line(a,b)} for name,owners,a,b in specs]


def fixture_junctions():
    return {'pp':(32,32),'mp':(-32,32),'pm':(32,-32),'mm':(-32,-32)}


def fixture_seed(cy):
    return 'C' if cy<32 or cy>480 else 'X'


def fixture_labels():
    y,x=np.mgrid[:512,:512];inside_x=(x<32)|(x>=480);inside_y=(y<32)|(y>=480)
    return np.where(inside_x,np.where(inside_y,3,1),np.where(inside_y,2,0)).astype('uint8')


def fixed_rows():
    rows=[]
    for name,kind,q,bridge,start,end,states,n,charge in jd.BOUNDS:
        axis=1 if kind=='X' else 0
        rows.append({'id':name,'kind':kind,'quadrant':list(q),'bridge':list(bridge),
          'start':list(start),'end':list(end),'states':list(states),'progressRowsInclusive':n,
          'latticeStatesProposed':charge,'progressStep':1 if end[axis]>start[axis] else -1,
          'ownerA':'P','ownerB':kind})
    return {'branches':rows}


class ExactGeometry(unittest.TestCase):
    def test_exact_diagonal_integer_and_overlap_events(self):
        event=segment_event((24,42),(25,41),(24,41),(25,42))
        self.assertEqual(event['point'],(F(49,2),F(83,2)))
        self.assertEqual((event['t'],event['u']),(F(1,2),F(1,2)))
        self.assertEqual(segment_event((0,0),(1,0),(1,0),(1,1))['point'],(1,0))
        self.assertIsNone(segment_event((0,0),(1,0),(0,1),(1,1)))
        self.assertTrue(segment_event((0,0),(2,0),(1,0),(3,0))['overlap'])

    def test_first_mutual_crossing_rejects_conflicting_order_and_overlap(self):
        a=[(0,0),(1,1),(2,0),(3,1)]
        b=[(0,1),(1,0),(2,1),(3,0)]
        chosen,events=first_mutual_intersection(a,b)
        self.assertEqual(chosen,(F(1,2),F(1,2)));self.assertEqual(len(events),3)
        with self.assertRaises(GuardError):first_mutual_intersection(a,list(reversed(b)))
        with self.assertRaises(GuardError):first_mutual_intersection([(0,0),(2,0)],[(1,0),(3,0)])

    def test_clip_exact_rational_junction_and_original_vertices(self):
        points=[(0,0),(1,1),(2,0),(3,1)]
        self.assertEqual(clip_progress(points,0,(F(1,2),F(1,2)),(F(5,2),F(1,2))),
          [(F(1,2),F(1,2)),(1,1),(2,0),(F(5,2),F(1,2))])
        with self.assertRaises(GuardError):clip_progress(points,0,(F(1,2),0),(3,1))

    def test_full_torus_graph_then_scanline_matches_independent_analytic_regions(self):
        report,edges=validate_graph(fixture_arcs(),fixture_junctions())
        self.assertTrue(report['allTorusIntersectionsChecked']);self.assertEqual(report['junctions'],4)
        actual=rasterize(edges,fixture_seed)
        self.assertTrue(np.array_equal(actual,fixture_labels()))
        raster=validate_raster(actual,exception=None)
        self.assertTrue(raster['strictAdjacentWrapFamilyAgreement'])
        self.assertEqual(raster['exceptionIncidentEdges'],[])

    def test_half_integer_four_way_tie_uses_parent_and_only_declared_cell(self):
        # Isolated synthetic graph, never any actual source/rank path.
        arcs=fixture_arcs();by={a['id']:a for a in arcs};j=(F(63,2),F(63,2))
        by['cy+']['points']=line((-32,32),(31,32))+[j]
        by['cx+']['points']=line((32,-32),(32,30))+[(31,31),j]
        by['lx+']['points']=[j]+line((32,32),(32,480))
        by['ly+']['points']=[j,(32,31),(33,31),(34,32)]+line((35,32),(480,32))
        junctions=fixture_junctions();junctions['pp']=j
        report,edges=validate_graph(arcs,junctions)
        labels=rasterize(edges,fixture_seed)
        self.assertEqual(int(labels[31,31]),0)
        raster=validate_raster(labels,exception=(31,31))
        self.assertTrue(raster['exceptionIncidentEdges'])
        with self.assertRaises(GuardError):validate_raster(labels,exception=(24,41))
        bad=labels.copy();bad[31,31]=1
        with self.assertRaisesRegex(GuardError,'must retain parent P'):validate_raster(bad,exception=(31,31))

    def test_graph_rejects_retrace_dangling_wrong_owner_and_extra_cross(self):
        good=fixture_arcs()
        bad=copy.deepcopy(good);bad[0]['points'].insert(2,bad[0]['points'][0])
        with self.assertRaises(GuardError):validate_graph(bad,fixture_junctions())
        bad=copy.deepcopy(good);bad[0]['points']=bad[0]['points'][:-1]
        with self.assertRaises(GuardError):validate_graph(bad,fixture_junctions())
        bad=copy.deepcopy(good);bad[0]['owners']=('C','P')
        with self.assertRaises(GuardError):validate_graph(bad,fixture_junctions())
        # All four pairs still meet every junction, but sectors are wrong.
        bad=copy.deepcopy(good)
        for arc in bad[:4]:arc['owners']=('C','Y' if arc['owners'][1]=='X' else 'X')
        with self.assertRaisesRegex(GuardError,'incident owner cycle'):validate_graph(bad,fixture_junctions())
        bad=copy.deepcopy(good)
        # Add a local bow tie in one arc; graph degree2 cannot excuse its crossing.
        p=bad[0]['points'];p[8:13]=[(-24,32),(-23,33),(-24,33),(-23,32),(-22,32),(-21,32),(-20,32)]
        with self.assertRaisesRegex(GuardError,'interior graph crossing'):validate_graph(bad,fixture_junctions())

    def test_graph_overlap_and_disconnected_loop_are_distinct_failures(self):
        bad=fixture_arcs();p=bad[0]['points']
        p[8:10]=[(-24,32),(F(-93,4),32),(F(-95,4),32),(-23,32)]
        with self.assertRaisesRegex(GuardError,'Collinear overlap'):validate_graph(bad,fixture_junctions())
        bad=fixture_arcs()+[{'id':'island','owners':('P','X'),
          'points':[(300,300),(301,300),(301,301),(300,301),(300,300)]}]
        with self.assertRaisesRegex(GuardError,'Disconnected vector'):validate_graph(bad,fixture_junctions())

    def test_coincident_scan_events_resolve_owner_graph_not_sort_order(self):
        a=frozenset('CX');b=frozenset('XP')
        self.assertEqual(transition('C',[a,b]),'P')
        self.assertEqual(transition('C',[b,a]),'P')
        self.assertEqual(transition('C',[a,a]),'C')
        with self.assertRaises(GuardError):transition('C',[frozenset('PY')])


class RasterGuards(unittest.TestCase):
    def test_protected_parent_and_strict_wrap_failure_are_mandatory(self):
        a=fixture_labels();a[100,100]=1
        with self.assertRaisesRegex(GuardError,'protected'):validate_raster(a,exception=None)
        a=fixture_labels();a[100,0]=3
        with self.assertRaisesRegex(GuardError,'wrap pixels'):validate_raster(a,exception=None)

    def test_source_chart_adjacency_not_just_label_periodicity(self):
        a=fixture_labels()
        from anchor_bridge import source_lookup
        def wrong(owner,x,y):
            sx,sy=source_lookup(owner,x,y)
            return (sx+1,sy) if x==0 else (sx,sy)
        with self.assertRaisesRegex(GuardError,'source cells not adjacent'):validate_raster(a,exception=None,lookup=wrong)

    def test_half_open_support_opposite_contacts_and_disconnected_regions(self):
        a=fixture_labels();a[100,48]=1
        with self.assertRaises(GuardError):validate_raster(a,protected=(49,48,464,464),exception=None)
        a=fixture_labels();a[20,20]=0
        with self.assertRaisesRegex(GuardError,'opposite-owner'):validate_raster(a,exception=None)
        small=np.array([[0,0,1,1],[2,3,1,1],[2,3,0,1],[2,3,1,1]],dtype='uint8')
        with self.assertRaisesRegex(GuardError,'Disconnected'):connected_labels(small,4)


class CorrectOwnerBudget(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.module=jd.prior_module()

    def test_exact_fixed_eight_rows_and_8725_shared_cumulative_states(self):
        rows=jd.branches_from_plan(fixed_rows());budget=self.module.Budget(limit=853525,used=844800)
        for row in rows:
            grid,first,last,signed=jd.continuation_grid(self.module,row)
            solution=self.module.minimum_path(np.zeros(grid.destination.shape[:2]),budget,start=first,end=last)
            self.assertEqual(solution['columns'][0],first);self.assertEqual(solution['columns'][-1],last)
            self.assertEqual(solution['chargedStates'],row['latticeStatesProposed'])
            axis=1 if row['kind']=='X' else 0
            self.assertEqual(tuple(signed[0,first]),tuple(row['start']))
            self.assertEqual(tuple(signed[-1,last]),tuple(row['end']))
            points=[tuple(map(int,signed[r,col])) for r,col in enumerate(solution['columns'])]
            arc=jd.branch_arc(row,points)
            self.assertEqual(arc['points'][0],JUNCTIONS[row['id'][:2]])
            self.assertEqual(arc['points'][-1],tuple(row['end']))
            self.assertIn(tuple(row['bridge']),arc['points'][:3])
            wrong=list(points);wrong[-1]=(wrong[-1][0]+1,wrong[-1][1]+1)
            with self.assertRaises(GuardError):jd.branch_arc(row,wrong)
        self.assertEqual(budget.used,853525)
        with self.assertRaises(self.module.DiagnosticError):budget.consume(1)
        bad=fixed_rows();bad['branches'][0]['start'][0]+=1
        with self.assertRaises(GuardError):jd.branches_from_plan(bad)

    def test_grid_cost_correct_parent_and_donor_coordinates_reflected_all_quadrants(self):
        y,x=np.mgrid[:512,:512];rgb=np.stack((x%251,y%251,(x+y)%251),2).astype('uint8')
        g=self.module.luminance_gradient(rgb)
        for row in jd.branches_from_plan(fixed_rows()):
            grid,_,_,signed=jd.continuation_grid(self.module,row)
            self.assertTrue(np.array_equal(grid.owner_a,grid.destination))
            axis=0 if row['kind']=='X' else 1
            expected=signed[:,:,axis]+(384 if axis==0 else 128)
            self.assertTrue(np.array_equal(grid.owner_b[:,:,axis],expected))
            cost=self.module.grid_cost(rgb,g,grid)
            for r,c in [(0,0),(len(signed)-1,24)]:
                ax,ay=grid.owner_a[r,c];bx,by=grid.owner_b[r,c]
                manual=sum(abs(int(rgb[ay,ax,k])-int(rgb[by,bx,k])) for k in range(3))/(255*3)+.25*max(g[ay,ax],g[by,bx])
                self.assertAlmostEqual(float(cost[r,c]),float(manual),places=14)

    def test_retained_long_exact_inclusive353_and_negative_side_chart(self):
        candidate={'longPaths':{}}
        for name in ('X+','X-','Y+','Y-'):
            axis=1 if name[0]=='X' else 0;other=1-axis
            rows=[]
            for p in range(48,464):
                dest=[0,0];dest[axis]=p;dest[other]=30 if name[1]=='+' else 480
                rows.append(dest+[0,0,0,0,0.0])
            candidate['longPaths'][name]={'lookups':rows}
            points=jd.retained_long(candidate,name)
            self.assertEqual(len(points),353);self.assertEqual(points[0][axis],80);self.assertEqual(points[-1][axis],432)
            self.assertEqual(points[0][other],30 if name[1]=='+' else -32)
        candidate['longPaths']['X+']['lookups'].pop()
        with self.assertRaises(GuardError):jd.retained_long(candidate,'X+')

    def test_ownership_runs_are_exact_contiguous_half_open_no_material_values(self):
        labels=fixture_labels();runs=jd.owner_runs(labels);replay=np.zeros_like(labels)
        for y,row in enumerate(runs):
            at=0
            for start,end,owner in row:
                self.assertEqual(start,at);self.assertLess(start,end);replay[y,start:end]=OWNERS.index(owner);at=end
            self.assertEqual(at,512)
        self.assertTrue(np.array_equal(labels,replay))

    def test_public_cli_description_and_unapproved_actual_run_refusal(self):
        script=Path(jd.__file__);journal=script.parent/'actual-continuation-journal.json'
        self.assertFalse(journal.exists())
        before={p.name:p.read_bytes() for p in script.parent.glob('actual*') if p.is_file()}
        r=subprocess.run([sys.executable,str(script),'--describe'],capture_output=True,text=True,timeout=10)
        self.assertEqual(r.returncode,0,r.stderr);d=json.loads(r.stdout)
        self.assertEqual(d['maximumCumulative'],853525);self.assertFalse(d['compositeAllowed'])
        with tempfile.TemporaryDirectory(prefix='quaked388-fixture-',dir='/private/tmp') as td:
            r=subprocess.run([sys.executable,str(script),'--run-source','--approval',str(Path(td)/'not-authority.json')],capture_output=True,text=True,timeout=10)
            self.assertNotEqual(r.returncode,0);self.assertIn('fixed independent root',r.stderr)
        self.assertFalse(journal.exists());self.assertEqual(before,{p.name:p.read_bytes() for p in script.parent.glob('actual*') if p.is_file()})

    def test_no_authority_cannot_reach_source_reader_or_dp(self):
        with patch.object(jd,'prior_module',side_effect=AssertionError('Must not load source runner')):
            with self.assertRaises(GuardError):jd.run_source(Path('/private/tmp/not-an-approval'))

    def test_failed_topology_retains_spent_paths_and_first_witness_no_clobber(self):
        with tempfile.TemporaryDirectory(prefix='quaked388-failure-fixture-',dir='/private/tmp') as td:
            root=Path(td);(root/'source').write_bytes(b'first-source-witness')
            snapshot=self.module.Snapshot(root,{'source':jd.sha((root/'source').read_bytes())})
            budget=self.module.Budget(limit=853525,used=853525)
            record={'paths':{'synthetic':{'lookups':[[1,2,3,4,5,6,.1]]}}}
            receipt=jd.retain_failure(root/'failed',snapshot,record,{},GuardError('fixture topology failure'),budget)
            saved=json.loads((root/'failed/failure.json').read_text())
            self.assertEqual(saved['paths'],record['paths']);self.assertEqual(saved['knownChargedAdditionalStates'],8725)
            self.assertTrue(saved['sourceInputsStillExact']);self.assertFalse(saved['automaticRetry'])
            with self.assertRaises(GuardError):jd.retain_failure(root/'failed',snapshot,record,{},ValueError('again'),budget)
            (root/'source').write_bytes(b'changed-source')
            jd.retain_failure(root/'changed',snapshot,record,{},ValueError('changed'),budget)
            saved=json.loads((root/'changed/failure.json').read_text())
            self.assertFalse(saved['sourceInputsStillExact'])
            self.assertEqual(saved['firstInputHashes']['source'],jd.sha(b'first-source-witness'))
            self.assertIn('changed',saved['sourceRecheckFailure'])

    def test_interruption_after_issuance_retains_failed_journal_without_budget_reset(self):
        # Fully isolated synthetic runner injection; no actual candidate or DP read.
        with tempfile.TemporaryDirectory(prefix='quaked388-interrupt-fixture-',dir='/private/tmp') as td:
            root=Path(td);approval=root/'approval.json';approval.write_text('{"fixture":true}')
            corridor=root/'correct-owner-corridors-plan-v1.json'
            corridor.write_text(json.dumps(fixed_rows()))
            snapshot=self.module.Snapshot(root,{p.name:jd.sha(p.read_bytes()) for p in (approval,corridor)})
            parent={'candidates':[{'candidate':'C2','centre':[384,128]}]}
            def interrupted(rgb):raise KeyboardInterrupt('isolated fixture interruption')
            fake=SimpleNamespace(Budget=self.module.Budget,luminance_gradient=interrupted)
            with patch.object(jd,'ROOT',root),patch.object(jd,'HERE',root),patch.object(jd,'PLAN',root), \
                 patch.object(jd,'validate_authority',return_value={}), \
                 patch.object(jd,'prior_module',return_value=fake), \
                 patch.object(jd,'actual_context',return_value=(snapshot,np.zeros((512,512,3),dtype='uint8'),parent,{})):
                with self.assertRaises(KeyboardInterrupt):jd.run_source(approval)
            journal=json.loads((root/'actual-continuation-journal.json').read_text())
            self.assertEqual(journal['state'],'FAILED_OR_UNRESOLVED_NO_RETRY_ART_F1_HOLD')
            self.assertEqual(journal['knownChargedAdditionalStates'],0)
            self.assertFalse(journal['automaticRetry'])
            failure=json.loads((root/'actual-failure-v1/failure.json').read_text())
            self.assertTrue(failure['sourceInputsStillExact']);self.assertEqual(failure['usedCumulativeStates'],844800)


if __name__=='__main__':unittest.main(verbosity=2)
