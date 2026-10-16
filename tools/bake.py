# -*- coding: utf-8 -*-
"""在本地用命令行生成字体文件，和网页里的「字体文件」用同一份代码（assets/py/bake_core.py）。

  python3 tools/bake.py job.json 源字体目录 输出.zip

job.json 是 {"jobs": [...], "opts": {...}}，格式和网页交给 Worker 的一样（见 assets/js/bake.js 的 fxRun）。
需要 fonttools==4.60.2（WOFF2 另需 brotli）：pip install -r tests/requirements.txt
"""
import json, os, shutil, sys, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'py'))
import bake_core

if len(sys.argv) != 4:
    sys.exit(__doc__)
job, src, out = sys.argv[1:]
d = json.load(open(job, encoding='utf-8'))
work = tempfile.mkdtemp()
opts = {**d['opts'], 'src': os.path.join(os.path.abspath(src), ''), 'work': os.path.join(work, '')}
res = json.loads(bake_core.run_all(json.dumps(d['jobs']), json.dumps(opts), lambda n, label: n >= 0 and n % 1 == 0 and print(label)))
if 'error' in res:
    sys.exit(f"生成失败：{res['error']} {res.get('name', '')}\n{res.get('msg', '')}")
shutil.move(os.path.join(work, 'out.zip'), out)
for name, size in res['files']: print(f'{name}  {size / 1e6:.1f} MB')
