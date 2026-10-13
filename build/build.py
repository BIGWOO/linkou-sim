import sys
W=sys.argv[1];B=W+'/build/'
s=open(B+'shell.html').read()
import os
s=s.replace('/*__ORTHO__*/',open(B+'ortho.json').read() if os.path.exists(B+'ortho.json') else 'null')
for k,f in (('/*__DATA__*/','data.json'),('/*__SIM__*/','sim.js'),('/*__VIEW__*/','view.js'),('/*__APP__*/','app.js')):
    assert k in s; s=s.replace(k,open(B+f).read().replace('</script','<\\/script'))
open(W+'/linkou-interchange.html','w').write(s)
# 本機預覽用：補上文件骨架
open(B+'preview/index.html','w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>'+s+'</body></html>')
print(len(s))
