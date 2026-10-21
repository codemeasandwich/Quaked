"""Exact source-free torus interfaces and binary ownership; never material RGB."""
from collections import defaultdict, deque
from fractions import Fraction as F
from itertools import product
import math

import numpy as np
from anchor_bridge import GuardError, require, point, source_lookup

SIDE = 512
OWNERS = ('P','X','Y','C')
PRIORITY = {name:index for index,name in enumerate(OWNERS)}
ALLOWED = {frozenset(pair) for pair in ('CX','CY','PX','PY')}
JUNCTIONS = {'pp':(F(49,2),F(83,2)), 'mp':(F(-40),F(38)),
             'pm':(F(31),F(-46)), 'mm':(F(-35),F(-34))}


def canonical(p, side=SIDE):
    return tuple(v % side for v in point(p))


def cross(a,b):
    return a[0]*b[1]-a[1]*b[0]


def sub(a,b):
    return tuple(x-y for x,y in zip(a,b))


def segment_event(a,b,c,d):
    """None, exact isolated point/parameters, or explicit nonzero overlap."""
    a,b,c,d=map(point,(a,b,c,d));r,s=sub(b,a),sub(d,c)
    require(r != (0,0) and s != (0,0),'Zero-length vector segment')
    denom=cross(r,s);q=sub(c,a)
    if denom:
        t,u=cross(q,s)/denom,cross(q,r)/denom
        if 0 <= t <= 1 and 0 <= u <= 1:
            return {'point':tuple(a[i]+t*r[i] for i in (0,1)), 't':t,'u':u}
        return None
    if cross(q,r):return None
    axis=0 if r[0] else 1
    t0,t1=(c[axis]-a[axis])/r[axis],(d[axis]-a[axis])/r[axis]
    lo,hi=max(F(0),min(t0,t1)),min(F(1),max(t0,t1))
    if lo > hi:return None
    if lo < hi:return {'overlap':True}
    p=tuple(a[i]+lo*r[i] for i in (0,1))
    sa=0 if s[0] else 1
    return {'point':p,'t':lo,'u':(p[sa]-c[sa])/s[sa]}


def first_mutual_intersection(a,b):
    """Both paths must reach the same first event; later loops are discarded."""
    events={}
    for i,(p,q) in enumerate(zip(a,a[1:])):
        for j,(r,s) in enumerate(zip(b,b[1:])):
            e=segment_event(p,q,r,s)
            if e is None:continue
            require('overlap' not in e,'Overlapping incoming caps')
            at=(F(i)+e['t'],F(j)+e['u']);key=e['point']
            if key in events:
                old=events[key];events[key]=(min(old[0],at[0]),min(old[1],at[1]))
            else:events[key]=at
    require(events,'Incoming caps never intersect')
    first_a=min(events,key=lambda p:(events[p][0],events[p][1],p))
    first_b=min(events,key=lambda p:(events[p][1],events[p][0],p))
    require(first_a == first_b,'Conflicting first cap crossing order')
    return first_a,events


def clip_progress(curve,axis,start,end):
    """Clip a monotone curve to exact on-curve endpoints, retaining its vertices."""
    pts=list(map(point,curve));a,b=point(start),point(end)
    require(a[axis] < b[axis] and all(q[axis]>p[axis] for p,q in zip(pts,pts[1:])),
            'Cap progress must be strictly increasing')
    def on_curve(target):
        for p,q in zip(pts,pts[1:]):
            if p[axis] <= target[axis] <= q[axis]:
                t=(target[axis]-p[axis])/(q[axis]-p[axis])
                if tuple(p[k]+t*(q[k]-p[k]) for k in (0,1)) == target:return True
        return False
    require(on_curve(a) and on_curve(b),'Junction not on retained cap')
    return [a]+[p for p in pts if a[axis]<p[axis]<b[axis]]+[b]


def validate_graph(arcs,junctions=JUNCTIONS,side=SIDE):
    """Check exact torus graph, every intersection and all local owner sectors."""
    require(arcs and len({a['id'] for a in arcs})==len(arcs),'Missing/duplicate arcs')
    expected={canonical(p,side) for p in junctions.values()}
    require(len(expected)==4,'Require four distinct declared junctions')
    edges=[];adj=defaultdict(list);unique=set();buckets=defaultdict(list)
    for arc in arcs:
        pair=frozenset(arc['owners']);require(pair in ALLOWED,'Wrong interface owner pair')
        pts=list(map(point,arc['points']));require(len(pts)>=2,'Empty interface')
        for a,b in zip(pts,pts[1:]):
            delta=sub(b,a)
            require(delta != (0,0) and max(map(abs,delta))<=1,'Nonlocal/retraced vector step')
            ca,cb=canonical(a,side),canonical(b,side)
            key=frozenset((ca,cb));require(key not in unique,'Duplicate/retraced vector edge')
            unique.add(key);idx=len(edges)
            aa=ca;bb=tuple(ca[k]+delta[k] for k in (0,1))
            edges.append({'a':aa,'b':bb,'pair':pair,'arc':arc['id']})
            adj[ca].append((cb,pair,delta,idx));adj[cb].append((ca,pair,tuple(-v for v in delta),idx))
            for x in range(math.floor(min(aa[0],bb[0])),math.floor(max(aa[0],bb[0]))+1):
                for y in range(math.floor(min(aa[1],bb[1])),math.floor(max(aa[1],bb[1]))+1):
                    buckets[(x%side,y%side)].append(idx)
    for node,neighbours in adj.items():
        require(len(neighbours)==(4 if node in expected else 2),'Wrong degree/dangling vector node')
        if node not in expected:
            require(neighbours[0][1]==neighbours[1][1],'Undeclared ownership junction')
        else:
            require({n[1] for n in neighbours}==ALLOWED,'Wrong four-owner junction pairs')
            ordered=sorted(neighbours,key=lambda n:math.atan2(float(n[2][1]),float(n[2][0])))
            sectors=[]
            for a,b in zip(ordered,ordered[1:]+ordered[:1]):
                require(cross(a[2],b[2]) != 0 or sum(x*y for x,y in zip(a[2],b[2]))<0,
                        'Coincident incident rays')
                common=a[1]&b[1];require(len(common)==1,'Invalid incident owner cycle')
                sectors.append(next(iter(common)))
            require(set(sectors)==set(OWNERS) and len(set(sectors))==4,'Missing/repeated junction sector')
    require(expected <= adj.keys(),'Declared junction absent')
    checked=set()
    for entries in buckets.values():
        for pos,i in enumerate(entries):
            for j in entries[pos+1:]:
                if i==j:continue
                key=tuple(sorted((i,j)))
                if key in checked:continue
                checked.add(key);a,b=edges[i],edges[j]
                for dx,dy in product((-side,0,side),repeat=2):
                    c=tuple(b['a'][k]+(dx,dy)[k] for k in (0,1));d=tuple(b['b'][k]+(dx,dy)[k] for k in (0,1))
                    e=segment_event(a['a'],a['b'],c,d)
                    if e is None:continue
                    require('overlap' not in e,'Collinear overlap in vector graph')
                    require(e['t'] in (0,1) and e['u'] in (0,1),'Unintended interior graph crossing')
                    require(canonical(e['point'],side) in {canonical(a['a'],side),canonical(a['b'],side)} &
                            {canonical(c,side),canonical(d,side)},'Nonmutual graph endpoint')
    visited=set();todo=[next(iter(adj))]
    while todo:
        n=todo.pop()
        if n in visited:continue
        visited.add(n);todo.extend(x[0] for x in adj[n])
    require(len(visited)==len(adj),'Disconnected vector graph')
    return {'vertices':len(adj),'edges':len(edges),'junctions':4,'connected':True,
            'allTorusIntersectionsChecked':True,'allLocalOwnerCyclesCorrect':True},edges


def transition(current,pairs):
    """Resolve coincident scan events by exact owner graph, not pair ordering."""
    require(1<=len(pairs)<=4,'Unexpected scan-event multiplicity')
    terminals=set()
    def visit(owner,left):
        if not left:terminals.add(owner);return
        for i,pair in enumerate(left):
            if owner in pair:visit(next(iter(pair-{owner})),left[:i]+left[i+1:])
    visit(current,list(pairs))
    require(len(terminals)==1,'Ambiguous/nonincident scan transitions')
    return next(iter(terminals))


def rasterize(edges,seed_for_row,side=SIDE):
    """Binary pixel-centre classification; no post-hoc support repair or RGB."""
    labels=np.empty((side,side),dtype='uint8')
    for y in range(side):
        cy=F(2*y+1,2);events=defaultdict(list)
        for edge in edges:
            a,b=edge['a'],edge['b']
            for dy in (-side,0,side):
                ay,by=a[1]+dy,b[1]+dy
                if ay==by:
                    require(ay!=cy,'Horizontal interface through pixel-centre scanline')
                    continue
                if min(ay,by)<=cy<max(ay,by):
                    t=(cy-ay)/(by-ay);x=(a[0]+t*(b[0]-a[0]))%side
                    events[x].append(edge['pair'])
        ordered=sorted(events.items());current=seed_for_row(cy);require(current in OWNERS,'Invalid scan seed')
        start=current;at=0
        for x in range(side):
            cx=F(2*x+1,2)
            while at<len(ordered) and ordered[at][0]<cx:
                current=transition(current,ordered[at][1]);at+=1
            owner=current
            if at<len(ordered) and ordered[at][0]==cx:
                pairs=ordered[at][1]
                owner=min(set.union(*(set(p) for p in pairs)),key=PRIORITY.get)
                current=transition(current,pairs);at+=1
            labels[y,x]=PRIORITY[owner]
        while at<len(ordered):
            current=transition(current,ordered[at][1]);at+=1
        require(current==start,'Nonperiodic scan ownership')
    return labels


def connected_labels(labels,side):
    for label in range(4):
        places=np.argwhere(labels==label);require(len(places)>0,'Missing owner raster region')
        start=tuple(map(int,places[0]));seen={start};q=deque([start])
        while q:
            y,x=q.popleft()
            for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                p=((y+dy)%side,(x+dx)%side)
                if p not in seen and labels[p]==label:seen.add(p);q.append(p)
        require(len(seen)==len(places),'Disconnected owner raster region')


def validate_raster(labels,protected=(48,48,464,464),exception=(24,41),lookup=source_lookup):
    a=np.asarray(labels);require(a.shape==(SIDE,SIDE) and a.dtype==np.uint8,'Require512 binary-owner atlas')
    require(np.all(a<4),'Unknown raster owner')
    if exception is not None:
        require(len(exception)==2 and all(type(v) is int and 0<=v<SIDE for v in exception),
                'Invalid declared one-cell exception')
        ex,ey=exception
        require(int(a[ey,ex])==0,'Declared half-cell junction must retain parent P')
    x0,y0,x1,y1=protected;require(np.all(a[y0:y1,x0:x1]==0),'Donor entered protected parent rectangle')
    require(np.array_equal(a[:,0],a[:,-1]) and np.array_equal(a[0],a[-1]),'Adjacent wrap pixels switch owner family')
    require(set(a[:,0])<= {1,3} and set(a[0])<= {2,3},'Wrong exposed wrap owner family')
    # Verify same-chart adjacent source cells rather than vector periodicity alone.
    for i in range(SIDE):
        owner=OWNERS[int(a[i,0])];left,right=lookup(owner,511,i),lookup(owner,0,i)
        require((right[0]-left[0],right[1]-left[1])==(1,0),'X wrap source cells not adjacent')
        owner=OWNERS[int(a[0,i])];top,bottom=lookup(owner,i,511),lookup(owner,i,0)
        require((bottom[0]-top[0],bottom[1]-top[1])==(0,1),'Y wrap source cells not adjacent')
    exceptions=[]
    for y in range(SIDE):
        for x in range(SIDE):
            owner=OWNERS[int(a[y,x])];sx,sy=lookup(owner,x,y)
            require(0<=sx<SIDE and 0<=sy<SIDE,'Source index escaped fixed chart')
            if owner=='P':require((sx,sy)==(x,y),'Parent source not exact outside mask')
            for nx,ny in (((x+1)%SIDE,y),(x,(y+1)%SIDE)):
                other=OWNERS[int(a[ny,nx])]
                if owner!=other and frozenset((owner,other)) not in ALLOWED:
                    require(exception in ((x,y),(nx,ny)),'Forbidden opposite-owner raster contact')
                    exceptions.append([[x,y],[nx,ny]])
    connected_labels(a,SIDE)
    return {'ownerPixels':{owner:int((a==i).sum()) for i,owner in enumerate(OWNERS)},
            'protectedRectangle':list(protected),'protectedParentExact':True,
            'strictAdjacentWrapFamilyAgreement':True,'wrapSourceCellsAdjacent':True,
            'allFourTorusRegionsConnected':True,'allSourceLookupsWithinFixedHalfOpenCharts':True,
            'oneCellException':list(exception) if exception is not None else None,'exceptionIncidentEdges':exceptions,
            'noRGBProduced':True}
