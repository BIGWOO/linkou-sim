# 高公局車輛偵測器（VD）歷史資料：擷取林口交流道各匝道的 5 分鐘流量
# 來源：https://tisvcloud.freeway.gov.tw/history/motc20/VD/<日期>/VDLive_HHMM.xml.gz（逐分鐘）
# 用法：python3 -I build/vd.py <專案根目錄> <逐分鐘檔所在目錄> [日期 YYYYMMDD，預設 20260908]
import sys, os, gzip, json, xml.etree.ElementTree as ET
W, SRC = sys.argv[1], sys.argv[2]
DAY = sys.argv[3] if len(sys.argv) > 3 else '20260908'
RAMPS = {  # 模型端點代碼 → VDID
    'A_S': 'VD-N1-S-41-O-NW-1A-林口-文化一路', 'B_S': 'VD-N1-S-41-O-NW-1B-林口-文化北路',
    'A_N': 'VD-N1-N-41-O-SE-1A-林口-文化一路', 'B_N': 'VD-N1-N-41-O-SE-1B-林口-文化北路',
    'A_S_on': 'VD-N1-S-41-I-WS-1A-林口-文化一路', 'B_S_on': 'VD-N1-S-41-I-WS-1B-林口-文化北路',
    'A_N_on': 'VD-N1-N-41-I-EN-1A-林口-文化一路', 'B_N_on': 'VD-N1-N-41-I-EN-1B-林口-文化北路',
}
ids = {v: k for k, v in RAMPS.items()}
vol = {k: [0] * 288 for k in RAMPS}; ok = {k: [0] * 288 for k in RAMPS}  # 每 5 分鐘：流量合計、有效分鐘數
for f in sorted(os.listdir(SRC)):
    if not f.startswith('VDLive_'): continue
    hh, mm = int(f[7:9]), int(f[9:11]); b = (hh * 60 + mm) // 5
    try: t = ET.fromstring(gzip.open(os.path.join(SRC, f)).read())
    except Exception: continue
    ns = t.tag.split('}')[0] + '}'
    for vd in t.iter(ns + 'VDLive'):
        k = ids.get(vd.find(ns + 'VDID').text)
        if not k: continue
        st = vd.find('.//' + ns + 'Status')
        if st is None or st.text != '0': continue
        n = 0
        for v in vd.iter(ns + 'Vehicle'):
            x = v.find(ns + 'Volume')
            if x is not None and x.text and x.text.lstrip('-').isdigit() and int(x.text) > 0: n += int(x.text)
        vol[k][b] += n; ok[k][b] += 1
# 換算成 5 分鐘流量：有效分鐘不足 3 分鐘的時段視為缺值（null）
out = {k: [round(vol[k][b] * 5 / ok[k][b]) if ok[k][b] >= (3 if len(os.listdir(SRC)) > 400 else 1) else None for b in range(288)] for k in RAMPS} # 只有每 5 分鐘一筆時，以該分鐘乘 5 估計
os.makedirs(W + '/data/vd', exist_ok=True)
json.dump({'date': DAY[:4] + '-' + DAY[4:6] + '-' + DAY[6:], 'src': 'tisvcloud motc20 VDLive', 'ids': RAMPS, 'vol5': out}, open(W + '/data/vd/ramps_' + DAY + '.json', 'w'), ensure_ascii=False)
for k in RAMPS:
    v = [x for x in out[k] if x is not None]
    print(k, 'valid bins', len(v), '/288', 'daily', sum(v), 'peak 5min', max(v) if v else None)
