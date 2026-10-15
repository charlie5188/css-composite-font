"""改了 assets 之后，更新 index.html 里的 ?v= 内容哈希，避免 GitHub Pages 和浏览器用旧的缓存。
用法：python3 tools/rehash.py ."""
import re, sys, hashlib
repo = sys.argv[1]
p = f'{repo}/index.html'; s = open(p, encoding='utf-8').read()
def ver(path):
    t = open(f'{repo}/{path}', encoding='utf-8').read()
    return hashlib.sha1(t.encode('utf-8')).hexdigest()[:8]
s = re.sub(r'(assets/[\w/.]+)\?v=\w+', lambda m: f'{m.group(1)}?v={ver(m.group(1))}', s)
open(p, 'w', encoding='utf-8').write(s); print('ok')
