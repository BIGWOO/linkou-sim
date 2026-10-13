# 下載國土測繪中心正射影像（通用版）WMTS 圖磚並打包為 build/ortho.json
import math,sys,os,json,base64,time,subprocess
W=sys.argv[1];OUT=W+'/data/ortho/'
LAT0,LON0=25.0652,121.3660
kx=111320*math.cos(math.radians(LAT0));ky=110574
def tile(x,y,z):
    lat=LAT0+y/ky;lon=LON0+x/kx;n=2**z
    return (lon+180)/360*n,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
SETS=[('far',16,(-4300,4000,-1800,1400)),('near',18,(-1250,940,-330,340))]
res={}
for name,z,(x0,x1,y0,y1) in SETS:
    a=tile(x0,y1,z);b=tile(x1,y0,z)
    c0,r0,c1,r1=int(a[0]),int(a[1]),int(b[0]),int(b[1])
    tiles=[]
    for r in range(r0,r1+1):
        for c in range(c0,c1+1):
            f=OUT+'%d_%d_%d.jpg'%(z,r,c)
            if not os.path.exists(f) or os.path.getsize(f)<500:
                for att in range(4):  # 以 curl 下載（Python 3.14 對該站憑證的嚴格檢查會失敗）
                    subprocess.run(['curl','-s','-m','40','-A','Mozilla/5.0 linkou-study','-o',f,'https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/%d/%d/%d'%(z,r,c)])
                    if os.path.exists(f) and open(f,'rb').read(2)==b'\xff\xd8':break
                    time.sleep(2)
                time.sleep(0.15)
            tiles.append(base64.b64encode(open(f,'rb').read()).decode())
    res[name]=dict(z=z,c0=c0,r0=r0,nx=c1-c0+1,ny=r1-r0+1,t=tiles)
    print(name,z,c1-c0+1,'x',r1-r0+1,'tiles',len(tiles))
json.dump(res,open(W+'/build/ortho.json','w'),separators=(',',':'))
print(os.path.getsize(W+'/build/ortho.json'))
