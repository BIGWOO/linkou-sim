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
el=json.load(open(W+'/data/elev.json'))
el['h']=[round(v) for v in el['h']]
out=dict(origin=[LAT0,LON0],edges=edges,roads=roads,bld=bld,elev=el,vol=vol,spd=spd,ff=ff,date='2026-09-08')
s=json.dumps(out,ensure_ascii=False,separators=(',',':'))
open(W+'/build/data.json','w').write(s)
print(len(s),len(edges),len(roads),len(bld),ff)
