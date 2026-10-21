"""Exact common-tail classification; never a retained-overlap exception."""
from fractions import Fraction as F
from anchor_bridge import point, require
from atlas_geometry import segment_event, sub, cross


def overlap_interval(a,b,c,d):
    """Return entry/exit in both outward path directions, requiring agreement."""
    a,b,c,d=map(point,(a,b,c,d));r,s=sub(b,a),sub(d,c)
    require(r!=(0,0) and s!=(0,0) and cross(r,s)==0 and cross(sub(c,a),r)==0,
            'Require genuine collinear nonzero overlap')
    require(sum(x*y for x,y in zip(r,s))>0,'Backtracking/opposite-direction overlap')
    axis=0 if r[0] else 1
    lo=max(F(0),min((c[axis]-a[axis])/r[axis],(d[axis]-a[axis])/r[axis]))
    hi=min(F(1),max((c[axis]-a[axis])/r[axis],(d[axis]-a[axis])/r[axis]))
    require(lo<hi,'Expected nonzero common tail interval')
    entry=tuple(a[k]+lo*r[k] for k in (0,1));exit=tuple(a[k]+hi*r[k] for k in (0,1))
    other=0 if s[0] else 1
    u0,u1=(entry[other]-c[other])/s[other],(exit[other]-c[other])/s[other]
    require(0<=u0<u1<=1,'Common tail order conflicts across outward paths')
    return {'entry':entry,'exit':exit,'aParameters':(lo,hi),'bParameters':(u0,u1)}


def prefix(curve,order,chosen):
    pts=list(map(point,curve));order=F(order);index=order.numerator//order.denominator
    require(0<=order<=len(pts)-1,'Prefix cut outside curve')
    kept=pts[:index+1]
    if order.denominator!=1:kept.append(point(chosen))
    require(kept[-1]==point(chosen),'Prefix does not end at exact first mutual junction')
    return kept


def verify_retained_prefixes(a,b,chosen,orders):
    pa,pb=prefix(a,orders[0],chosen),prefix(b,orders[1],chosen)
    require(len(pa)>=2 and len(pb)>=2 and pa[0]!=pb[0],
            'Distinct nonempty incoming prefixes required at common-tail junction')
    for p,q in zip(pa,pa[1:]):
        for r,s in zip(pb,pb[1:]):
            event=segment_event(p,q,r,s)
            if event is None:continue
            require('overlap' not in event,'Overlap remains in retained incoming prefixes')
            require(event['point']==chosen,'Retained prefixes meet before chosen junction')
    return {'aRetainedVertices':len(pa),'bRetainedVertices':len(pb),
            'retainedPrefixesMeetOnlyAtJunction':True,'retainedOverlap':False}


def first_mutual_discarded_tail(a,b):
    """First event must agree in both prefixes; only strictly discarded tail overlaps.

    Every shared interval contributes its exact entry and exit events. The same
    first event must precede all intervals on BOTH outward paths. Prefixes are
    clipped there and independently checked to contain no overlap or earlier
    contact. Opposite direction, conflicting event order or retained overlap is
    always refused. Full completed graph validation remains a separate guard.
    """
    a,b=list(map(point,a)),list(map(point,b));events={};overlaps=[]
    def event(p,oa,ob):
        if p in events:events[p]=(min(events[p][0],oa),min(events[p][1],ob))
        else:events[p]=(oa,ob)
    for i,(p,q) in enumerate(zip(a,a[1:])):
        for j,(r,s) in enumerate(zip(b,b[1:])):
            e=segment_event(p,q,r,s)
            if e is None:continue
            if 'overlap' in e:
                o=overlap_interval(p,q,r,s)
                aa=tuple(F(i)+v for v in o['aParameters']);bb=tuple(F(j)+v for v in o['bParameters'])
                overlaps.append({**o,'aOrders':aa,'bOrders':bb,'aSegment':i,'bSegment':j})
                event(o['entry'],aa[0],bb[0]);event(o['exit'],aa[1],bb[1])
            else:event(e['point'],F(i)+e['t'],F(j)+e['u'])
    require(events,'Incoming caps never intersect')
    fa=min(events,key=lambda p:(events[p][0],events[p][1],p))
    fb=min(events,key=lambda p:(events[p][1],events[p][0],p))
    require(fa==fb,'Conflicting first cap crossing order')
    chosen=fa;orders=events[chosen]
    for overlap in overlaps:
        require(overlap['aOrders'][0]>=orders[0] and overlap['bOrders'][0]>=orders[1],
                'Overlap precedes chosen junction on an incoming prefix')
        overlap['entireNonzeroIntervalDiscardedOnBothPaths']=True
    # Stronger than selecting events: recheck the geometry that survives clipping.
    prefix_proof=verify_retained_prefixes(a,b,chosen,orders)
    audit={'chosen':chosen,'orders':orders,'discardedCommonTailIntervals':overlaps,
           'prefixProof':prefix_proof,'noRetainedOverlapException':True}
    return chosen,events,audit
