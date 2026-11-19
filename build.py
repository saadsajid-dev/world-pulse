"""Builds site/index.html from src/template.html and the data/ folder.
Run:  python3 build.py
"""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
def rd(*p): return open(os.path.join(here, *p), encoding='utf-8').read()
t = rd('src', 'template.html')
t = t.replace('/*__TOPO__*/null', json.dumps(json.loads(rd('data', 'countries-110m.json')), separators=(',', ':')))
t = t.replace('/*__NEWS__*/null', json.dumps(json.loads(rd('data', 'news.json')), separators=(',', ':'), ensure_ascii=False))
t = t.replace('/*__LAND__*/', rd('data', 'land.b64').strip())
t = t.replace('/*__SMALL__*/null', rd('data', 'small.json'))
t = t.replace('/*__ISO__*/null', json.dumps(json.loads(rd('data', 'iso.json')), separators=(',', ':')))
os.makedirs(os.path.join(here, 'site'), exist_ok=True)
open(os.path.join(here, 'site', 'index.html'), 'w', encoding='utf-8').write(t)
print('site/index.html', len(t), 'bytes')
