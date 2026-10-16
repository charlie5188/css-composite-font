# -*- coding: utf-8 -*-
"""合成字体烘焙的核心：在浏览器的 Pyodide 里由 assets/js/bake.js 的 Worker 运行，本地测试和 tools/bake.py 也用它。

run_all(jobs_json, opts_json, progress) 按工具导出的规则表生成每个字重 / 正斜体的字体，打包成 zip。
每条规则的字体只取它负责的字，按 size-adjust 缩放、按基线偏移平移，再合并成一个字体；行高度量用汉字基础字体的。
"""
import os, re, io, json, copy, time, zipfile
from fontTools.ttLib import TTFont, TTCollection, newTable
from fontTools import subset
from fontTools.merge import Merger, Options as MergeOptions
from fontTools.ttLib.scaleUpem import scale_upem
from fontTools.varLib import instancer

MAX_GLYPHS = 65535      # 一个字体最多这么多字形（glyph ID 是 16 位）；测试里改小
RARE = ((0x20000, 0x10FFFF), (0xF900, 0xFAFF), (0x2F800, 0x2FA1F))      # 罕用汉字：扩展 B 以后（第 2、3 平面）和兼容汉字

STYLE = {100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black'}

class BakeError(Exception):
    def __init__(self, code, name=''):
        super().__init__(code); self.code = code; self.name = name

def to_otf(font):
    """TrueType（二次曲线）转成 CFF（三次曲线）的 OTF：二次曲线能精确写成三次曲线，只有控制点取整的误差（不到 1/1000 em）。
    竖排原点：TrueType 由上边距和字形顶边算出，CFF 要写进 VORG 表"""
    import collections
    from fontTools.pens.t2CharStringPen import T2CharStringPen
    from fontTools.fontBuilder import FontBuilder
    order, gs, hm, glyf = font.getGlyphOrder(), font.getGlyphSet(), font['hmtx'], font['glyf']
    cs, vorg = {}, {}
    for gn in order:
        pen = T2CharStringPen(hm[gn][0], gs)
        gs[gn].draw(pen)
        cs[gn] = pen.getCharString()
        if 'vmtx' in font and glyf[gn].numberOfContours: vorg[gn] = font['vmtx'][gn][1] + glyf[gn].yMax
    n, post = font['name'], font['post']
    ascii_ = lambda x: x if x and all(ord(c) < 128 for c in x) else n.getDebugName(6)      # CFF 里的名字只能是 ASCII，中日文名字留在 name 表里
    info = {'FullName': ascii_(n.getDebugName(4)), 'FamilyName': ascii_(n.getDebugName(1)), 'Weight': ascii_(n.getDebugName(2)),
            'Notice': ''.join(c for c in (n.getDebugName(0) or '') if ord(c) < 128)[:500],
            'ItalicAngle': post.italicAngle, 'UnderlinePosition': post.underlinePosition, 'UnderlineThickness': post.underlineThickness}
    fb = FontBuilder(font=font); fb.isTTF = False      # 从 font 推断成了 TrueType，改成 CFF
    for t in ('glyf', 'loca', 'fpgm', 'prep', 'cvt ', 'gasp'):
        if t in font: del font[t]
    fb.setupCFF(n.getDebugName(6), info, cs, {})
    m = newTable('maxp'); m.tableVersion = 0x00005000; m.numGlyphs = len(order); font['maxp'] = m
    post.formatType = 3.0
    if vorg:
        v = newTable('VORG'); v.majorVersion, v.minorVersion = 1, 0
        v.defaultVertOriginY = collections.Counter(vorg.values()).most_common(1)[0][0]
        v.VOriginRecords = {g: y for g, y in vorg.items() if y != v.defaultVertOriginY}
        v.numVertOriginYMetrics = len(v.VOriginRecords)
        font['VORG'] = v
    font.sfntVersion = 'OTTO'

def is_ttc(path):
    with open(path, 'rb') as fh: return fh.read(4) == b'ttcf'

def open_face(path, ps=None, lazy=False):
    """字体集合（TTC/OTC）按 PostScript 名取其中一款，没有名字或找不到时取第一款"""
    if not is_ttc(path): return TTFont(path, lazy=lazy)
    for i in range(len(TTCollection(path, lazy=True).fonts)):
        if ps and TTFont(path, fontNumber=i, lazy=True)['name'].getDebugName(6) == ps:
            return TTFont(path, fontNumber=i, lazy=lazy)
    return TTFont(path, fontNumber=0, lazy=lazy)

def check_source(path, name, ps=None):
    try:
        tags = set(open_face(path, ps, lazy=True).keys())
    except Exception:
        raise BakeError('read', name)
    if not tags & {'glyf', 'CFF ', 'CFF2'}:
        raise BakeError('outline', name)      # 只有位图（例如 emoji）的字体

def instance_file(path, weight, fvs, out, ps=None):
    """可变字体截到这个字重（其他轴取 fvs 里的值，没有的取默认值）；字体集合取出其中一款；普通静态字体原样返回"""
    f = open_face(path, ps)
    if 'fvar' in f:
        loc = {}
        for a in f['fvar'].axes:
            v = weight if a.axisTag == 'wght' and weight else (fvs or {}).get(a.axisTag)
            loc[a.axisTag] = None if v is None else min(a.maxValue, max(a.minValue, v))
        instancer.instantiateVariableFont(f, loc, inplace=True, updateFontNames=False)
    elif not is_ttc(path):
        return path
    f.save(out)
    return out

def cff_to_glyf(f):
    """CFF 轮廓（三次曲线）转成 TrueType（二次曲线），误差不超过 1 个单位。
    竖排原点：CFF 字体用 VORG 表记，TrueType 由 vmtx 的上边距和字形顶边算出，所以按 VORG 重算上边距"""
    from fontTools.pens.cu2quPen import Cu2QuPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    order, gs = f.getGlyphOrder(), f.getGlyphSet()
    glyphs = {}
    for gn in order:
        pen = TTGlyphPen(gs)
        gs[gn].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
        glyphs[gn] = pen.glyph()
    glyf = newTable('glyf'); glyf.glyphOrder = order; glyf.glyphs = glyphs
    vorg = f['VORG'] if 'VORG' in f else None
    for t in ('CFF ', 'CFF2', 'VORG'):
        if t in f: del f[t]
    f['glyf'] = glyf; f['loca'] = newTable('loca')
    hm = f['hmtx']
    for gn in order:
        g = glyphs[gn]; g.recalcBounds(glyf)
        hm[gn] = (hm[gn][0], g.xMin if g.numberOfContours else 0)
    if vorg is not None and 'vmtx' in f:      # 没有 VORG 时，原点本来就由上边距和字形顶边算出，不用改
        vm = f['vmtx']
        for gn in order:
            g = glyphs[gn]
            if g.numberOfContours: vm[gn] = (vm[gn][0], vorg.VOriginRecords.get(gn, vorg.defaultVertOriginY) - g.yMax)
    maxp = newTable('maxp'); maxp.tableVersion = 0x00010000; maxp.numGlyphs = len(order)
    for k in ('maxZones', 'maxTwilightPoints', 'maxStorage', 'maxFunctionDefs', 'maxInstructionDefs', 'maxStackElements', 'maxSizeOfInstructions', 'maxComponentElements', 'maxPoints', 'maxContours', 'maxCompositePoints', 'maxCompositeContours', 'maxComponentDepth'):
        setattr(maxp, k, 1 if k == 'maxZones' else 0)
    f['maxp'] = maxp
    post = f['post']; post.formatType = 2.0; post.extraNames = []; post.mapping = {}
    f.sfntVersion = '\x00\x01\x00\x00'

def align_scripts(fonts):
    """合并前让每个部件的 GSUB / GPOS 都有所有部件出现过的书写系统和语言。
    lang=ja 时数字、标点跟着前后的汉字算 hani；西文字体只在 DFLT / latn 下有字距，合并后有了 hani 就不再退回 DFLT，
    西文的字距、连字会全部失效。这里按 HarfBuzz 的退回规则预先补齐"""
    from fontTools.ttLib.tables import otTables as ot
    for tag in ('GSUB', 'GPOS'):
        tabs = [f[tag].table for f in fonts if tag in f and f[tag].table.ScriptList]
        want = {}
        for t in tabs:
            for sr in t.ScriptList.ScriptRecord:
                want.setdefault(sr.ScriptTag, set()).update(l.LangSysTag for l in sr.Script.LangSysRecord)
        for t in tabs:
            have = {sr.ScriptTag: sr.Script for sr in t.ScriptList.ScriptRecord}
            fb = (have.get('DFLT') or have.get('latn') or next(iter(have.values()))).DefaultLangSys
            for st, langs in want.items():
                sc = have.get(st)
                if sc is None:
                    sc = ot.Script(); sc.DefaultLangSys = copy.deepcopy(fb); sc.LangSysRecord = []; sc.LangSysCount = 0
                    rec = ot.ScriptRecord(); rec.ScriptTag = st; rec.Script = sc
                    t.ScriptList.ScriptRecord.append(rec); have[st] = sc
                dflt = sc.DefaultLangSys or fb
                got = {l.LangSysTag for l in sc.LangSysRecord}
                for lt in sorted(langs - got):
                    lr = ot.LangSysRecord(); lr.LangSysTag = lt; lr.LangSys = copy.deepcopy(dflt)
                    sc.LangSysRecord.append(lr)
                sc.LangSysRecord.sort(key=lambda l: l.LangSysTag); sc.LangSysCount = len(sc.LangSysRecord)
            t.ScriptList.ScriptRecord.sort(key=lambda r: r.ScriptTag); t.ScriptList.ScriptCount = len(t.ScriptList.ScriptRecord)

def in_ranges(rs, cp):
    return any(a <= cp <= b for a, b in rs)

def keep_langs(f, keep):
    """只留默认语言和 keep 里的语言（OpenType 语言标签）：其他地区的字形变体（locl）就不会被子集化留下来。
    返回去掉的语言标签"""
    dropped = set()
    for tag in ('GSUB', 'GPOS'):
        if tag not in f or not f[tag].table.ScriptList: continue
        for sr in f[tag].table.ScriptList.ScriptRecord:
            recs = sr.Script.LangSysRecord
            dropped.update(l.LangSysTag for l in recs if l.LangSysTag not in keep)
            sr.Script.LangSysRecord = [l for l in recs if l.LangSysTag in keep]; sr.Script.LangSysCount = len(sr.Script.LangSysRecord)
    return sorted(t.strip() for t in dropped)

def bake(plan, srcs, family, weight, italic, lic, work, lang=None, trimmed=None):
    """plan：规则表（第一条是汉字基础字体）；srcs：和 plan 同序、已截到字重的源字体路径；lang：目标语言的 OpenType 标签（例如 'JAN '）。
    字形超过 MAX_GLYPHS 时从汉字基础字体里删减，删了什么记进 trimmed（dict）。返回 (TTFont, PostScript 名)"""
    cmaps = [TTFont(p, lazy=True).getBestCmap() for p in srcs]
    U = TTFont(srcs[0], lazy=True)['head'].unitsPerEm      # 以汉字基础字体的 em 为准
    owners = [o for r in plan for o in r['owners']]
    custom = [o for o in owners if o['o'].startswith('#')][::-1]
    cls = [o for o in owners if not o['o'].startswith('#') and o['o'] != 'han']
    han_shift = next((o['shift'] for o in owners if o['o'] == 'han'), 0)
    def shift_of(cp):
        for o in custom + cls:
            if o['ranges'] and in_ranges(o['ranges'], cp): return o['shift']
        return han_shift
    # 每个字符归哪条规则：和 CSS 一样，后面的规则优先；它的字体里没有这个字就往前退，最后退到基础字体
    seg = {}
    for cp in sorted(set().union(*[set(c) for c in cmaps])):
        for i in range(len(plan) - 1, -1, -1):
            if (i == 0 or in_ranges(plan[i]['range'] or [], cp)) and cp in cmaps[i]:
                seg.setdefault((i, shift_of(cp)), []).append(cp); break
    top = TTFont(srcs[0], lazy=True)['OS/2'].sTypoAscender
    def sub_part(i, cps, level):
        """子集化。level 0 照原样；1 只留目标语言的字形变体；2 再去掉罕用汉字（只用在汉字基础字体上）"""
        f = TTFont(srcs[i])
        if level >= 1: trimmed_langs.update(keep_langs(f, {lang} if lang else set()))
        if level >= 2:
            rare = [c for c in cps if any(a <= c <= b for a, b in RARE)]
            trimmed_rare.update(rare); rs = set(rare); cps = [c for c in cps if c not in rs]
        o = subset.Options()
        o.layout_features = ['*']; o.layout_scripts = ['*']
        o.name_IDs = ['*']; o.name_languages = ['*']; o.name_legacy = True
        o.notdef_outline = True; o.glyph_names = True; o.hinting = False; o.legacy_kern = True
        o.drop_tables += ['STAT', 'DSIG', 'meta', 'MVAR', 'HVAR', 'VVAR', 'BASE', 'JSTF', 'COLR', 'CPAL', 'SVG ', 'sbix', 'CBDT', 'CBLC', 'EBDT', 'EBLC', 'EBSC']      # 彩色、位图字形合并不了，只留轮廓
        sub = subset.Subsetter(o); sub.populate(unicodes=cps); sub.subset(f)
        return f
    def make_part(i, s, f):
        """子集化以后：转成 TrueType 曲线、按大小缩放、按基线平移、补竖排度量"""
        if 'glyf' not in f: cff_to_glyf(f)      # 只转这个部件用到的字形：比整个字体转换快得多
        src_upem = f['head'].unitsPerEm
        k = plan[i]['size'] / 100 * U / src_upem
        if abs(k - 1) > 1e-6:
            scale_upem(f, round(src_upem * k))      # 坐标 × k
            f['head'].unitsPerEm = U                # 再把 em 改回来：字形相对 em 放大（缩小）了 k 倍
        dy = round(s / 100 * U)
        glyf = f['glyf']
        if dy:
            for gn in f.getGlyphOrder():
                g = glyf[gn]
                if g.numberOfContours > 0: g.coordinates.translate((0, dy)); g.recalcBounds(glyf)
            for gn in f.getGlyphOrder():
                g = glyf[gn]
                if g.isComposite(): g.recalcBounds(glyf)
        if 'vmtx' not in f:      # 竖排度量：没有 vmtx 的（西文）补一份，竖排原点放在基础字体的 ascender
            vm = newTable('vmtx'); vm.metrics = {}
            for gn in f.getGlyphOrder():
                g = glyf[gn]
                vm.metrics[gn] = (U, top - g.yMax if g.numberOfContours else 0)
            f['vmtx'] = vm
            vh = newTable('vhea')
            vh.tableVersion = 0x00011000; vh.ascent = U // 2; vh.descent = -(U // 2); vh.lineGap = 0
            vh.advanceHeightMax = U; vh.minTopSideBearing = vh.minBottomSideBearing = vh.yMaxExtent = 0
            vh.caretSlopeRise = 0; vh.caretSlopeRun = 1; vh.caretOffset = 0
            vh.reserved1 = vh.reserved2 = vh.reserved3 = vh.reserved4 = 0; vh.metricDataFormat = 0; vh.numberOfVMetrics = 0
            f['vhea'] = vh
        elif dy:
            vm = f['vmtx']
            for gn, (ah, tsb) in list(vm.metrics.items()):
                if glyf[gn].numberOfContours: vm.metrics[gn] = (ah, tsb - dy)
        return f
    # 先做其他字体的部件，再做汉字基础字体的：加起来超过字形上限时，汉字基础字体按 level 逐步删减（重新子集化）
    trimmed_langs, trimmed_rare = set(), set()
    built = {k: sub_part(k[0], cps, 0) for k, cps in seg.items() if k[0] != 0}
    other = sum(len(f.getGlyphOrder()) for f in built.values())
    base_keys = [k for k in seg if k[0] == 0]
    for level in range(3):
        trimmed_langs.clear(); trimmed_rare.clear()
        base = {k: sub_part(0, seg[k], level) for k in base_keys}
        if other + sum(len(f.getGlyphOrder()) for f in base.values()) <= MAX_GLYPHS: break
    else:
        raise BakeError('glyphs', '')
    built.update(base)
    built = {k: make_part(*k, f) for k, f in built.items()}
    if trimmed is not None:
        if trimmed_langs: trimmed.setdefault('langs', set()).update(trimmed_langs)
        if trimmed_rare: trimmed.setdefault('rare', set()).update(trimmed_rare)
    parts = [(os.path.join(work, 'part%d_%s.ttf' % k), built[k]) for k in sorted(built)]
    align_scripts([f for _, f in parts])
    for p, f in parts: f.save(p)
    parts = [p for p, _ in parts]
    font = Merger(options=MergeOptions()).merge(parts)
    for p in parts: os.remove(p)
    base = TTFont(srcs[0])
    bk = plan[0]['size'] / 100
    for t, fields in (('hhea', ['ascent', 'descent', 'lineGap']), ('OS/2', ['sTypoAscender', 'sTypoDescender', 'sTypoLineGap', 'usWinAscent', 'usWinDescent']),
                      ('vhea', ['ascent', 'descent', 'lineGap'])):
        if t in base and t in font:
            for fd in fields: setattr(font[t], fd, round(getattr(base[t], fd) * bk))
    font['OS/2'].fsSelection = (font['OS/2'].fsSelection & ~(1 << 7)) | (base['OS/2'].fsSelection & (1 << 7))
    font['post'].underlinePosition = base['post'].underlinePosition; font['post'].underlineThickness = base['post'].underlineThickness
    if 'BASE' in base: font['BASE'] = base['BASE']      # 表意字框等基线：取汉字基础字体的
    W, it = weight, italic
    style = (('' if W == 400 else STYLE[W] + ' ') + 'Italic') if it else STYLE[W]
    font['OS/2'].usWeightClass = W
    bold = W == 700
    font['OS/2'].fsSelection = (font['OS/2'].fsSelection & ~0b1100001) | (0b100000 if bold else 0) | (1 if it else 0) | (0b1000000 if not bold and not it else 0)
    font['head'].macStyle = (1 if bold else 0) | (2 if it else 0)
    font['post'].italicAngle = 0
    if it:      # 斜体角度取西文斜体的（汉字仍是正体）
        for p in srcs[1:]:
            a = TTFont(p, lazy=True)['post'].italicAngle
            if a: font['post'].italicAngle = a; break
    font['OS/2'].recalcUnicodeRanges(font)
    if hasattr(font['OS/2'], 'recalcAvgCharWidth'): font['OS/2'].recalcAvgCharWidth(font)
    fam = family
    if W in (400, 700): legacy_fam, legacy_sub = fam, ('Bold' if bold else 'Regular') if not it else ('Bold Italic' if bold else 'Italic')
    else: legacy_fam, legacy_sub = fam + ' ' + STYLE[W], 'Italic' if it else 'Regular'
    ps = (re.sub(r'[^A-Za-z0-9]', '', fam)[:40] or 'CompositeFont') + '-' + style.replace(' ', '')
    srcnames = [TTFont(p, lazy=True)['name'] for p in srcs]
    copyright = ' / '.join(dict.fromkeys(n.getDebugName(0) for n in srcnames if n.getDebugName(0)))
    name = newTable('name'); name.names = []
    vals = {0: copyright, 1: legacy_fam, 2: legacy_sub, 3: ps + ';' + time.strftime('%Y%m%d'), 4: fam + ' ' + style, 5: 'Version 1.000',
            6: ps, 13: lic[0], 14: lic[1], 16: fam, 17: style}
    for nid, val in vals.items():
        if not val: continue
        name.setName(val, nid, 3, 1, 0x409)
        try:
            val.encode('mac_roman'); name.setName(val, nid, 1, 0, 0)
        except UnicodeEncodeError:
            pass      # 中日文名字只写 Windows 平台的名称记录
    font['name'] = name
    font['head'].fontRevision = 1.0
    return font, ps

def trim_note(trimmed, notes):
    """删减了什么：按界面语言的模板写成一段说明。notes：{'head': 原因, 'langs': '…{langs}…', 'rare': '…{n}…', 'names': {'KOR': '韩文', …}, 'sep': '、'}"""
    out, names = [], notes.get('names') or {}
    if trimmed.get('langs') and notes.get('langs'):
        out.append(notes['langs'].replace('{langs}', notes.get('sep', ', ').join(names.get(t, t) for t in sorted(trimmed['langs']))))
    if trimmed.get('rare') and notes.get('rare'): out.append(notes['rare'].replace('{n}', str(len(trimmed['rare']))))
    return notes.get('head', '') + ''.join(out) if out else ''

def run_all(jobs_json, opts_json, progress):
    try:
        jobs = json.loads(jobs_json); opts = json.loads(opts_json)
        SRC, WORK = opts.get('src', '/src/'), opts.get('work', '/w/')      # 本地测试时换成临时目录
        for s in {s['file']: s for j in jobs for s in j['srcs'] if s}.values():
            check_source(SRC + s['file'], s['name'], s.get('ps'))
        key = lambda s: (s['file'], s.get('ps'), s.get('weight'), json.dumps(s.get('fvs'), sort_keys=True))
        inst, made, trimmed = {}, 0, {}
        zb = open(WORK + 'out.zip', 'wb'); z = zipfile.ZipFile(zb, 'w', zipfile.ZIP_DEFLATED)
        out = []
        for n, job in enumerate(jobs):
            progress(n, job['label'])
            srcs = []
            for s in job['srcs']:
                k = key(s)
                if k not in inst:
                    made += 1
                    inst[k] = instance_file(SRC + s['file'], s.get('weight'), s.get('fvs'), WORK + 'inst%d.ttf' % made, s.get('ps'))
                srcs.append(inst[k])
            font, ps = bake(job['plan'], srcs, opts['family'], job['weight'], job['italic'], opts['lic'], WORK, opts.get('otLang'), trimmed)
            b = io.BytesIO(); font.save(b); data = b.getvalue()
            z.writestr(ps + '.ttf', data); out.append([ps + '.ttf', len(data)])
            if opts.get('woff2'):
                font.flavor = 'woff2'; b = io.BytesIO(); font.save(b); data = b.getvalue()
                z.writestr(ps + '.woff2', data); out.append([ps + '.woff2', len(data)])
            if opts.get('otf'):      # 印刷用：最后转成 CFF 曲线，这个字体对象之后不再用
                progress(n + 0.5, job['label'])
                font.flavor = None; to_otf(font)
                b = io.BytesIO(); font.save(b); data = b.getvalue()
                z.writestr(ps + '.otf', data); out.append([ps + '.otf', len(data)])
            del font
            rest = {key(s) for j in jobs[n + 1:] for s in j['srcs'] if s}      # 后面用不到的截取结果：删掉，省内存
            for k in list(inst):
                if k not in rest:
                    if inst[k].startswith(WORK): os.remove(inst[k])
                    del inst[k]
        progress(-1, '')
        note = trim_note(trimmed, opts.get('notes') or {})
        for name, text in opts['extra']: z.writestr(name, text + ('\n\n' + note if note and name == 'README.txt' else ''))
        z.close(); zb.close()
        res = {'files': out}
        if trimmed: res['trimmed'] = {'langs': sorted(trimmed.get('langs', [])), 'rare': len(trimmed.get('rare', []))}
        return json.dumps(res)
    except BakeError as e:
        return json.dumps({'error': e.code, 'name': e.name})
    except Exception as e:
        import traceback
        return json.dumps({'error': 'internal', 'msg': traceback.format_exc()[-600:]})
