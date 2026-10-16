"""改了 assets 之后，更新 index.html 里的缓存版本号，避免 GitHub Pages 和浏览器用旧的缓存：
- 直接引用的文件（style.css、main.js 等）：?v= 换成内容哈希
- JS 模块：重新生成 import map，每个模块映射到带哈希的地址（模块之间 import 时不带 ?v=）
用法：python3 tools/rehash.py ."""
import glob, hashlib, json, os, re, sys
repo = sys.argv[1]
p = f'{repo}/index.html'; s = open(p, encoding='utf-8').read()
def ver(path):
    return hashlib.sha1(open(f'{repo}/{path}', 'rb').read()).hexdigest()[:8]
s = re.sub(r'(assets/[\w/.]+)\?v=\w+', lambda m: f'{m.group(1)}?v={ver(m.group(1))}', s)
mods = sorted(os.path.relpath(f, repo) for f in glob.glob(f'{repo}/assets/js/**/*.js', recursive=True))
imap = {'imports': {f'./{m}': f'./{m}?v={ver(m)}' for m in mods}}
s, n = re.subn(r'<script type="importmap">.*?</script>', lambda m: '<script type="importmap">' + json.dumps(imap, indent=1) + '</script>', s, flags=re.S)
assert n == 1, 'index.html 里应该有一个 import map'
open(p, 'w', encoding='utf-8').write(s); print('ok', len(mods), 'modules')
