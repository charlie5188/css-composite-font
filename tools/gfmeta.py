#!/usr/bin/env python3
"""重新生成 assets/js/gfmeta.js：Google Fonts 的元数据（可变轴、斜体、轴名、中日韩字体的风格）。

fonts.google.com/metadata/fonts 不允许网页直接读取，所以内置一份。用法：
    python3 tools/gfmeta.py            # 联网取最新的元数据，写进 assets/js/gfmeta.js
    python3 tools/gfmeta.py meta.json  # 用已经下载好的文件
"""
import json, sys, urllib.request, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets/js/gfmeta.js'
CJK = ('chinese-simplified', 'chinese-traditional', 'chinese-hongkong', 'japanese', 'korean')


def load(src=None):
    raw = pathlib.Path(src).read_text('utf-8') if src else urllib.request.urlopen('https://fonts.google.com/metadata/fonts').read().decode('utf-8')
    if raw.startswith(")]}'"):
        raw = raw[4:]
    return json.loads(raw)


def num(x):
    return str(int(x)) if float(x).is_integer() else repr(float(x))


def style_of(f):
    """中日韩字体的风格：标了展示 / 手写 / 等宽的算「其他」，否则看笔画（stroke），再看分类"""
    if f.get('classifications'):
        return 'other'
    s = f.get('stroke') or f.get('category')
    return {'Serif': 'serif', 'Sans Serif': 'sans'}.get(s, 'other')


def build(d):
    fams = sorted(d['familyMetadataList'], key=lambda f: f['family'])
    axes = {f['family']: ','.join(f"{a['tag']} {num(a['min'])} {num(a['max'])} {num(a['defaultValue'])}" for a in sorted(f['axes'], key=lambda a: a['tag']))
            for f in fams if f.get('axes')}
    italic = [f['family'] for f in fams if any(k.endswith('i') for k in f.get('fonts', {}))]
    used = {a['tag'] for f in fams for a in f.get('axes', [])}      # 只收有字体族用到的轴
    names = {a['tag']: a['displayName'] for a in sorted(d['axisRegistry'], key=lambda a: a['tag']) if a['tag'] in used}
    style = {'serif': [], 'sans': [], 'other': []}
    for f in fams:
        if any(s in f.get('subsets', []) for s in CJK):
            style[style_of(f)].append(f['family'])
    style = {k: ','.join(v) for k, v in style.items()}
    j = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))
    month = datetime.date.today().strftime('%Y-%m')
    return (f"/* Google Fonts 的元数据（{month} 取自 fonts.google.com/metadata/fonts；这个接口不允许网页直接读取，所以内置一份。由 tools/gfmeta.py 生成，不要手改）：\n"
            "   GF_AXES：可变字体的轴「标签 最小 最大 默认」；GF_ITALIC：有斜体的字体族；AXIS_NAMES：轴的英文名。没收录的字体族照旧在线检测 wght 轴。\n"
            "   GF_STYLE：中日韩字体的风格（serif = 宋体 / 明朝，sans = 黑体 / ゴシック，other = 展示、手写、等宽），逗号分隔 */\n"
            f"export const GF_AXES = {j(axes)};\n"
            f"export const GF_ITALIC = new Set({j('|'.join(italic))}.split('|'));\n"
            f"export const AXIS_NAMES = {j(names)};\n"
            f"export const GF_STYLE = {j(style)};\n")


if __name__ == '__main__':
    OUT.write_text(build(load(sys.argv[1] if len(sys.argv) > 1 else None)), 'utf-8')
    print('wrote', OUT.relative_to(ROOT))
