import json,math,urllib.request,time,sys
LAT0,LON0=25.0652,121.3660
kx=111320*math.cos(math.radians(LAT0));ky=110574
X0,X1,Y0,Y1,ST=-4300,4000,-1800,1400,100
nx=(X1-X0)//ST+1;ny=(Y1-Y0)//ST+1
pts=[(Y0+j*ST,X0+i*ST) for j in range(ny) for i in range(nx)]
out=[]
for k in range(0,len(pts),100):
    ch=pts[k:k+100]
    loc='|'.join('%.6f,%.6f'%(LAT0+y/ky,LON0+x/kx) for y,x in ch)
    for attempt in range(5):
        try:
            r=urllib.request.urlopen(urllib.request.Request('https://api.opentopodata.org/v1/srtm30m?locations='+loc,headers={'User-Agent':'linkou-study/1.0'}),timeout=40)
            d=json.load(r);out+=[q['elevation'] for q in d['results']];break
        except Exception as ex:
            print('retry',k,ex,file=sys.stderr);time.sleep(3)
    else: sys.exit('fail')
    time.sleep(1.1)
json.dump({'x0':X0,'y0':Y0,'st':ST,'nx':nx,'ny':ny,'h':out},open(sys.argv[1],'w'))
print(len(out),min(out),max(out))
