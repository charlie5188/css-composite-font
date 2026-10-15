"""生成单文件版本：把 style.css 和 assets/js/*.js（按 index.html 里的顺序）内联进一个 HTML。
用法：python3 tools/single.py . composite-font.html"""
import re, sys
repo, out = sys.argv[1], sys.argv[2]
idx = open(f'{repo}/index.html', encoding='utf-8').read()
head = idx[idx.index('<head>') + 6: idx.index('</head>')]
links = re.findall(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts[^>]*>', head)
body = idx[idx.index('<body>\n') + 7: idx.index('\n</body>')]
css = open(f'{repo}/assets/style.css', encoding='utf-8').read().replace('body{margin:0;background:var(--bg)', 'body{background:var(--bg)', 1)
names = re.findall(r'<script src="assets/js/([\w.]+)\?v=', head)
js = []
for i, n in enumerate(names):
    c = open(f'{repo}/assets/js/{n}', encoding='utf-8').read()
    if i and c.startswith("'use strict';\n"): c = c[len("'use strict';\n"):]
    js.append(c)
single = '<title>复合字体</title>\n' + '\n'.join(links) + '\n<style>\n' + css + '</style>\n\n' + body + '\n<script>\n' + ''.join(js) + '</script>\n'
open(out, 'w', encoding='utf-8').write(single)
print(len(single.encode()), names)
