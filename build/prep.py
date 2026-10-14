import json,math,collections,csv,glob,sys
W=sys.argv[1]
d=json.load(open(W+'/data/osm.json'))
LAT0,LON0=25.0652,121.3660
kx=111320*math.cos(math.radians(LAT0));ky=110574
def xy(p):return ((p['lon']-LON0)*kx,(p['lat']-LAT0)*ky)
r1=lambda v:round(v,1)
XMIN,XMAX=-4100,3800
def kind(e):
    t=e['tags'];h=t.get('highway')
    if h=='motorway':return 'v' if 'viaduct' in str(t.get('bridge','')) or t.get('name')=='五股楊梅高架道路' else 'm'
    if h=='motorway_link':return 'l'
    if h=='construction' and t.get('construction')=='motorway_link':return 'n'
    return None
els=d['elements']
net=[e for e in els if kind(e)]
cnt=collections.Counter()
for e in net:
    for i,n in enumerate(e['nodes']):
        cnt[n]+=1
        if i in(0,len(e['nodes'])-1):cnt[n]+=1
def clip(pts):
    # keep portion within XMIN..XMAX (assumes single crossing)
    out=[];cutA=cutB=False
    for i in range(len(pts)):
        p=pts[i];ins=XMIN<=p[0]<=XMAX
        if i>0:
            q=pts[i-1];qin=XMIN<=q[0]<=XMAX
            if ins!=qin:
                bx=XMIN if (min(p[0],q[0])<XMIN) else XMAX
                t=(bx-q[0])/(p[0]-q[0]);c=(bx,q[1]+t*(p[1]-q[1]))
                out.append(c)
                if ins:cutA=True
                else:cutB=True
        if ins:out.append(p)
    return out,cutA,cutB
edges=[]
for e in net:
    ns=e['nodes'];g=[xy(p) for p in e['geometry']];t=e['tags'];st=0;part=0
    for i in range(1,len(ns)):
        if i==len(ns)-1 or cnt[ns[i]]>1:
            pts,ca,cb=clip(g[st:i+1])
            if len(pts)>=2:
                eid='%d_%d'%(e['id'],part)
                edges.append(dict(id=eid,k=kind(e),a=('cut:'+eid+'a') if ca else str(ns[st]),b=('cut:'+eid+'b') if cb else str(ns[i]),
                    p=[[r1(x),r1(y)] for x,y in pts],ln=int(t['lanes']) if t.get('lanes','').isdigit() else 0,
                    ly=int(t.get('layer',0)),br=1 if 'bridge' in t else 0,tu=1 if 'tunnel' in t else 0,ms=int(t['maxspeed']) if t.get('maxspeed','').isdigit() else 0,ds=t.get('destination','')))
            st=i;part+=1
# surface roads
SK={'footway','path','steps','corridor','cycleway','proposed','track','pedestrian','construction','motorway','motorway_link'}
roads=[]
for e in els:
    t=e['tags'];h=t.get('highway')
    if not h or h in SK:continue
    g=[xy(p) for p in e['geometry']]
    if t.get('oneway')=='-1':g.reverse() # 與繪製方向相反的單行道
    if not any(-2500<=x<=3500 and -1600<=y<=1700 for x,y in g):continue
    roads.append(dict(t=h,n=t.get('name',''),ln=int(t['lanes']) if t.get('lanes','').isdigit() else 0,ow=1 if t.get('oneway') in('yes','-1') else 0,
        br=1 if 'bridge' in t else 0,ly=int(t.get('layer',0)) if str(t.get('layer','0')).lstrip('-').isdigit() else 0,p=[[r1(x),r1(y)] for x,y in g]))
bld=[]
for e in els:
    t=e['tags']
    if 'building' not in t:continue
    g=[xy(p) for p in e['geometry']]
    if len(g)<4:continue
    lv=t.get('building:levels','');ht=t.get('height','')
    try:lv=float(lv)
    except:lv=0
    try:ht=float(ht)
    except:ht=0
    bld.append(dict(t=t['building'],n=t.get('name',''),lv=lv,h=ht,p=[[r1(x),r1(y)] for x,y in g[:-1]]))
# traffic
CL=['31','32','41','42','5']
G=['01F0376S','01F0413S','01F0467S','01F0467N','01F0413N','01F0376N','01H0447S','01H0447N']
vol={g:[[0]*5 for _ in range(288)] for g in G}
for f in glob.glob(W+'/data/tdcs/M03A/**/*.csv',recursive=True):
    for r in csv.reader(open(f)):
        if len(r)>=5 and r[1] in vol:
            b=int(r[0][-5:-3])*12+int(r[0][-2:])//5
            vol[r[1]][b][CL.index(r[3])]+=int(r[4])
PAIRS=[('01F0376S','01F0413S'),('01F0413S','01F0467S'),('01F0467N','01F0413N'),('01F0413N','01F0376N'),('01F0376N','01F0340N'),('01F0467S','01F0492S')]
sp={a+'>'+b:[[0,0] for _ in range(288)] for a,b in PAIRS}
cls={a+'>'+b:[[] for _ in CL] for a,b in PAIRS}
for f in glob.glob(W+'/data/tdcs/M05A/**/*.csv',recursive=True):
    for r in csv.reader(open(f)):
        if len(r)>=6 and r[1]+'>'+r[2] in sp:
            k=r[1]+'>'+r[2];b=int(r[0][-5:-3])*12+int(r[0][-2:])//5
            v=int(r[4]);n=int(r[5])
            if n>0 and v>0:
                sp[k][b][0]+=v*n;sp[k][b][1]+=n
                cls[k][CL.index(r[3])].append(v)
spd={k:[round(a/n,1) if n else 0 for a,n in v] for k,v in sp.items()}
ff=[]
for ci in range(5):
    allv=sorted(sum((cls[k][ci] for k in cls),[]))
    ff.append(allv[int(len(allv)*0.85)] if allv else 90)
# 匝道端點銜接的地面道路（出口駛離段、入口進場段），沿 OSM 道路走 180 m
TERM_OUT={'A_S':[268,138],'A_S_T':[264,74],'B_S':[-914,86],'B_N':[-1106,-102],'A_N':[70,-82],'FLY1':[313,-261],'FLY2':[289,-252]}
TERM_IN={'A_S_on':[136,64],'B_S_on':[-1090,80],'B_N_on':[-979,-98],'A_N_on':[278,-75],'A_N_on2':[281,267]}
sw=[e for e in els if e['tags'].get('highway') and e['tags']['highway'] not in SK and 'bridge' not in e['tags']]
npos={};nway=collections.defaultdict(list)
for e in sw:
    for i,(n,p) in enumerate(zip(e['nodes'],e['geometry'])):
        npos[n]=xy(p);nway[n].append((e,i))
mpts=[]
for e in net:
    if kind(e)=='m':
        g=[xy(p) for p in e['geometry']]
        for i in range(1,len(g)):
            L=math.dist(g[i-1],g[i]);k=max(1,int(L/25))
            mpts+=[(g[i-1][0]+(g[i][0]-g[i-1][0])*q/k,g[i-1][1]+(g[i][1]-g[i-1][1])*q/k) for q in range(k+1)]
def dmain(p):return min((p[0]-q[0])**2+(p[1]-q[1])**2 for q in mpts)**.5
def nbrs(n,fwd):
    out=[]
    for e,i in nway[n]:
        ow=e['tags'].get('oneway');ns=e['nodes']
        f=i+1 if ow!='-1' else i-1;b=i-1 if ow!='-1' else i+1
        one=ow in('yes','-1') or e['tags'].get('junction')=='roundabout'
        cand=[f] if one else [f,b]
        if not fwd:cand=[b] if one else [f,b]
        for j in cand:
            if 0<=j<len(ns):out.append(ns[j])
    return out
def walk(c,fwd,L=180):
    n0=min(npos,key=lambda n:math.dist(npos[n],c))
    if math.dist(npos[n0],c)>20:return None
    path=[n0];tot=0;dirv=None
    while tot<L:
        n=path[-1];cs=[m for m in nbrs(n,fwd) if m not in path]
        if not cs:break
        if dirv is None:m=max(cs,key=lambda m:dmain(npos[m])-dmain(npos[n]))
        else:m=max(cs,key=lambda m:((npos[m][0]-npos[n][0])*dirv[0]+(npos[m][1]-npos[n][1])*dirv[1])/(math.dist(npos[m],npos[n]) or 1))
        dl=math.dist(npos[m],npos[n]);dirv=((npos[m][0]-npos[n][0])/(dl or 1),(npos[m][1]-npos[n][1])/(dl or 1));tot+=dl;path.append(m)
    pts=[[r1(npos[n][0]),r1(npos[n][1])] for n in path]
    return pts if fwd else pts[::-1]
# 林口A南出匝道末端（依高公局示意圖與空拍影像修正 OSM 線形）：
# 右轉槽化車道以較大半徑繞過槽化島，在路口北方約 65 m 匯入文化一路一段北向；直行／左轉為 5 車道進口
for e in edges:
    if e['id']=='182679857_0':e['p']=[[381.4,71.4],[364.5,74.5],[342.0,76.5],[320.0,80.0],[303.0,86.5],[289.0,96.0],[279.0,109.0],[272.5,123.0],[268.3,137.8]]
stubs={}
for k,c in TERM_OUT.items():
    p=walk(c,True)
    if p and len(p)>1:stubs[k]=p
for k,c in TERM_IN.items():
    p=walk(c,False)
    if p and len(p)>1:stubs[k]=p
stubs['A_S_T']=[[264.6,74.5],[247.5,74.7],[222.1,73.2],[170.1,70.1]] # 直行八德路
stubs['B_N_L']=[[-1106.6,-102.5],[-1097.0,-99.0],[-1091.5,-90.0],[-1091.0,-78.0],[-1084.0,29.0]] # 林口B北出左轉過橋往林口
stubs['B_N_T']=[[-1106.6,-102.5],[-1092.0,-103.0],[-1079.0,-103.0],[-1054.0,-102.0],[-1030.0,-102.0]] # 直行龜山一路
stubs['A_S_L']=[[264.6,74.5],[254.0,72.5],[248.5,64.0],[249.5,40.0],[256.3,-45.3]] # 左轉文化一路跨越橋
for k,p in stubs.items():print(k,len(p),p[0],p[-1],round(sum(math.dist(p[i],p[i+1]) for i in range(len(p)-1))))
# 綠地（林地 w、公園草地 p、水域 a）
green=[]
try:
    gd=json.load(open(W+'/data/green.json'))
    def gk(t):
        if t.get('natural') in('wood','scrub') or t.get('landuse')=='forest':return 'w'
        if t.get('natural')=='water':return 'a'
        return 'p'
    for e in gd['elements']:
        rings=[]
        if e['type']=='way' and 'geometry' in e:rings=[e['geometry']]
        elif e['type']=='relation':rings=[m['geometry'] for m in e.get('members',[]) if m.get('role')=='outer' and 'geometry' in m and m['geometry'][0]==m['geometry'][-1]]
        for g in rings:
            pts=[xy(q) for q in g]
            if len(pts)>=4 and any(-4300<x<4000 and -1800<y<1400 for x,y in pts):green.append(dict(t=gk(e['tags']),p=[[round(x),round(y)] for x,y in pts[:-1]]))
except Exception as ex:print('no green data',ex)
print('green polys',len(green))
# 機場捷運：主線、站內側線與車站
rail=dict(tracks=[],st=[])
try:
    rd=json.load(open(W+'/data/rail.json'))
    for e in rd['elements']:
        t=e.get('tags',{})
        if e['type']=='way' and t.get('railway')=='subway' and 'tunnel' not in t and 'geometry' in e:
            pts=[xy(q) for q in e['geometry']];pts=[q for q in pts if -4300<q[0]<4000 and -1800<q[1]<1400]
            if len(pts)>=2:rail['tracks'].append(dict(m=0 if t.get('service') else 1,p=[[r1(x),r1(y)] for x,y in pts]))
        if e['type']=='node' and t.get('railway')=='station':
            x,y=xy(e)
            if -4300<x<4000 and -1800<y<1400:rail['st'].append(dict(n=t.get('name',''),ref=t.get('ref',''),x=r1(x),y=r1(y)))
except Exception as ex:print('no rail data',ex)
# 多邊形關聯建物（OSM relation，例如長庚醫學大樓）
try:
    for e in rd['elements']:
        t=e.get('tags',{})
        if e['type']=='relation' and t.get('building'):
            for m in e.get('members',[]):
                g=m.get('geometry')
                if m.get('role')=='outer' and g and len(g)>=4 and g[0]==g[-1]:
                    lv=t.get('building:levels','')
                    try:lv=float(lv)
                    except:lv=0
                    bld.append(dict(t=t['building'],n=t.get('name',''),lv=lv,h=0,p=[[r1(x),r1(y)] for x,y in [xy(q) for q in g[:-1]]]))
except Exception as ex:print('relation buildings skipped',ex)
print('rail tracks',len(rail['tracks']),'stations',[s['ref'] for s in rail['st']])
el=json.load(open(W+'/data/elev.json'))
el['h']=[round(v) for v in el['h']]
# 林口各匝道 5 分鐘流量（高公局 VD，見 build/vd.py）
import os
ramp=json.load(open(W+'/data/vd/ramps_20260908.json'))['vol5'] if os.path.exists(W+'/data/vd/ramps_20260908.json') else None
out=dict(ramp=ramp,origin=[LAT0,LON0],rail=rail,green=green,stubs=stubs,edges=edges,roads=roads,bld=bld,elev=el,vol=vol,spd=spd,ff=ff,date='2026-09-08')
s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
open(W+'/build/data.json','w').write(s)
print(len(s),len(edges),len(roads),len(bld),ff)
