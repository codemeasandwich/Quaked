"""Synthetic geometry/custody fixtures; no actual source replay or DP."""
from fractions import Fraction as F
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode=True
import numpy as np
import geometry_replay as gr
from discarded_tail import first_mutual_discarded_tail, verify_retained_prefixes, overlap_interval
from anchor_bridge import GuardError


def branches():
    rows=[]
    for name,kind,q,bridge,start,end,states,n,charge in gr.legacy.BOUNDS:
        axis=1 if kind=='X' else 0
        rows.append({'id':name,'kind':kind,'quadrant':list(q),'bridge':list(bridge),'start':list(start),
          'end':list(end),'states':list(states),'progressRowsInclusive':n,'latticeStatesProposed':charge,
          'progressStep':1 if end[axis]>start[axis] else -1,'ownerA':'P','ownerB':kind})
    return gr.legacy.branches_from_plan({'branches':rows})


def synthetic_retained(rgb,gradient):
    records={}
    for row in branches():
        n=row['progressRowsInclusive'];axis=1 if row['kind']=='X' else 0;other=1-axis
        first=row['start'][other]-row['states'][0];last=row['end'][other]-row['states'][0]
        cols=[first+(last-first)*i//(n-1) for i in range(n)]
        lookups=[]
        for i,c in enumerate(cols):
            signed=[0,0];signed[axis]=row['start'][axis]+i*row['progressStep'];signed[other]=row['states'][0]+c
            dest=[v%512 for v in signed];donor=dest.copy();donor[other]=signed[other]+(384 if row['kind']=='X' else 128)
            ax,ay=dest;bx,by=donor
            colour=sum(abs(int(rgb[ay,ax,k])-int(rgb[by,bx,k])) for k in range(3))/(255*3)
            cost=colour+.25*max(gradient[ay,ax],gradient[by,bx])
            lookups.append(dest+dest+donor+[float(cost)])
        costs=[p[6] for p in lookups]
        records[row['id']]={'grid':row['id'],'columns':cols,'lookups':lookups,'chargedStates':row['latticeStatesProposed'],
          'totalCost':sum(costs),'meanCost':sum(costs)/n,'maximumNodeCost':max(costs)}
    return {'paths':records}


class DiscardedTail(unittest.TestCase):
    def test_same_direction_tail_at_first_junction_is_entirely_discarded(self):
        a=[(-34,-33),(-35,-34),(-36,-35)]
        b=[(-34,-35),(-35,-34),(-36,-35)]
        chosen,events,audit=first_mutual_discarded_tail(a,b)
        self.assertEqual(chosen,(-35,-34));self.assertEqual(audit['orders'],(1,1))
        tail,=audit['discardedCommonTailIntervals']
        self.assertEqual(tail['entry'],(-35,-34));self.assertEqual(tail['exit'],(-36,-35))
        self.assertTrue(tail['entireNonzeroIntervalDiscardedOnBothPaths'])
        self.assertFalse(audit['prefixProof']['retainedOverlap'])
        self.assertEqual(audit['prefixProof']['aRetainedVertices'],2)

    def test_fractional_entry_and_same_direction_split_tail_keep_only_prefixes(self):
        a=[(0,0),(2,0),(3,0)];b=[(1,-1),(1,0),(3,0)]
        chosen,_,audit=first_mutual_discarded_tail(a,b)
        self.assertEqual(chosen,(1,0));self.assertEqual(audit['orders'],(F(1,2),1))
        self.assertEqual(len(audit['discardedCommonTailIntervals']),2)
        self.assertTrue(audit['prefixProof']['retainedPrefixesMeetOnlyAtJunction'])

    def test_backtracking_overlap_is_rejected_even_if_a_contact_exists(self):
        for a,b in [([(0,0),(2,0)],[(2,0),(0,0)]),
                    ([(0,-1),(0,0),(2,0)],[(0,1),(0,0),(2,0),(1,0)])]:
            with self.assertRaisesRegex(GuardError,'Backtracking'):first_mutual_discarded_tail(a,b)

    def test_conflicting_prefix_first_contacts_before_shared_tail_are_rejected(self):
        a=[(0,0),(1,0),(1,1),(2,1),(3,1)]
        b=[(0,1),(1,1),(2,F(1,2)),(1,0),(2,0),(2,1),(3,1)]
        with self.assertRaisesRegex(GuardError,'Conflicting first'):first_mutual_discarded_tail(a,b)

    def test_cannot_keep_overlap_or_skip_earlier_junction_to_later_target(self):
        a=[(-34,-33),(-35,-34),(-36,-35)]
        b=[(-34,-35),(-35,-34),(-36,-35)]
        with self.assertRaises(GuardError):verify_retained_prefixes(a,b,(-36,-35),(2,2))
        chosen,_,_=first_mutual_discarded_tail(a,b)
        self.assertNotEqual(chosen,(-36,-35))
        # The unchanged assemble guard will reject any different fixed target.
        with self.assertRaises(GuardError):gr.legacy.require(chosen==(-36,-35),'First mutual junction changed')

    def test_nonoverlap_diagonal_and_integer_first_events_preserve_old_semantics(self):
        chosen,_,audit=first_mutual_discarded_tail([(0,0),(1,1)],[(0,1),(1,0)])
        self.assertEqual(chosen,(F(1,2),F(1,2)));self.assertFalse(audit['discardedCommonTailIntervals'])
        chosen,_,audit=first_mutual_discarded_tail([(0,0),(1,0),(2,0)],[(1,-1),(1,0),(1,1)])
        self.assertEqual(chosen,(1,0));self.assertFalse(audit['discardedCommonTailIntervals'])

    def test_common_origin_empty_prefix_or_false_interval_is_rejected(self):
        with self.assertRaisesRegex(GuardError,'Distinct nonempty'):first_mutual_discarded_tail([(0,0),(1,1)],[(0,0),(1,1)])
        with self.assertRaises(GuardError):overlap_interval((0,0),(1,0),(2,0),(3,0))


class RetainedOnly(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        y,x=np.mgrid[:512,:512];cls.rgb=np.stack((x%251,y%251,(x+y)%251),2).astype('uint8')
        # Independent finite differences, same documented central luminance cost.
        lum=(cls.rgb.astype(float)/255)@np.array([.2126,.7152,.0722])
        cls.gradient=np.clip(abs(np.roll(lum,-1,1)-np.roll(lum,1,1))+abs(np.roll(lum,-1,0)-np.roll(lum,1,0)),0,1)

    def test_all349_literal_source_lookups_replay_without_dp_or_budget(self):
        retained=synthetic_retained(self.rgb,self.gradient)
        with patch.object(gr.legacy,'prior_module',side_effect=AssertionError('No source DP module needed for literal nodes')):
            paths,audits=gr.literal_paths(retained,branches(),self.rgb,self.gradient)
        self.assertEqual(len(paths),8);self.assertEqual(sum(a['retainedNodesChecked'] for a in audits),349)
        self.assertTrue(all(a['newDPStates']==0 for a in audits));self.assertEqual(sum(a['originalChargedStates'] for a in audits),8725)
        for row in branches():
            self.assertEqual(paths[row['id']][0],tuple(row['start']));self.assertEqual(paths[row['id']][-1],tuple(row['end']))

    def test_changed_literal_donor_cost_endpoint_or_original_clock_refuses(self):
        mutations=[lambda f:f['paths']['pp-X']['lookups'][0].__setitem__(4,410),
                   lambda f:f['paths']['pp-X']['lookups'][0].__setitem__(6,9.0),
                   lambda f:f['paths']['pp-X']['columns'].__setitem__(-1,0),
                   lambda f:f['paths']['pp-X'].__setitem__('chargedStates',951)]
        for change in mutations:
            retained=synthetic_retained(self.rgb,self.gradient);change(retained)
            with self.assertRaises(GuardError):gr.literal_paths(retained,branches(),self.rgb,self.gradient)

    def test_only_observed_mm_tail_allowed_and_no_legacy_module_global_mutation(self):
        original=gr.legacy.assemble.__globals__['first_mutual_intersection']
        with patch.object(gr,'TailPolicy') as policy_class:
            policy=policy_class.return_value
            policy.audits=[]
            # A synthetic fake function has no privileged old-frame source access.
            def fake(candidate,paths,rows):return [],{}, {},{}
            with patch.object(gr.legacy,'assemble',fake):
                with self.assertRaisesRegex(GuardError,'four original'):gr.assemble_retained({}, {}, [])
        self.assertIs(gr.legacy.assemble.__globals__['first_mutual_intersection'],original)

    def test_actual_fixed_policy_whitelists_only_one_exact_discarded_tail(self):
        audits=[]
        for key in ('pp','mp','pm','mm'):
            audits.append({'chosen':gr.legacy.JUNCTIONS[key],
              'prefixProof':{'retainedPrefixesMeetOnlyAtJunction':True,'retainedOverlap':False},
              'discardedCommonTailIntervals':[]})
        tail={'entry':(-35,-34),'exit':(-36,-35)}
        audits[-1]['discardedCommonTailIntervals']=[tail]
        self.assertTrue(gr.validate_tail_audits(audits))
        bad=copy.deepcopy(audits);bad[0]['discardedCommonTailIntervals']=[tail]
        with self.assertRaisesRegex(GuardError,'only root-observed'):gr.validate_tail_audits(bad)
        bad=copy.deepcopy(audits);bad[-1]['discardedCommonTailIntervals'][0]['exit']=(-37,-36)
        with self.assertRaisesRegex(GuardError,'only root-observed'):gr.validate_tail_audits(bad)
        bad=copy.deepcopy(audits);bad[-1]['prefixProof']['retainedOverlap']=True
        with self.assertRaisesRegex(GuardError,'Retained overlap proof'):gr.validate_tail_audits(bad)

    def test_public_description_and_unreviewed_replay_refuse_without_issuance(self):
        before={p.name:p.read_bytes() for p in gr.HERE.glob('*journal*.json')}
        r=subprocess.run([sys.executable,str(Path(gr.__file__)),'--describe'],capture_output=True,text=True,timeout=10)
        self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(json.loads(r.stdout)['newDPStates'],0)
        with tempfile.TemporaryDirectory(prefix='quaked388-geometry-fixture-',dir='/private/tmp') as td:
            r=subprocess.run([sys.executable,str(Path(gr.__file__)),'--replay','--approval',str(Path(td)/'fake.json')],capture_output=True,text=True,timeout=10)
        self.assertNotEqual(r.returncode,0);self.assertIn('root geometry-code',r.stderr)
        self.assertEqual(before,{p.name:p.read_bytes() for p in gr.HERE.glob('*journal*.json')})
        with patch.object(gr,'actual_context',side_effect=AssertionError('No actual source read allowed')):
            with self.assertRaises(GuardError):gr.replay(Path('/private/tmp/no-authority.json'))


if __name__=='__main__':unittest.main(verbosity=2)
