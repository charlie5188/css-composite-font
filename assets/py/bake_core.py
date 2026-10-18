# -*- coding: utf-8 -*-
"""Composite font baking core, run in browser Pyodide by the assets/js/bake.js worker and shared with local tests and tools/bake.py.

run_all(jobs_json, opts_json, progress) builds one font per weight and upright/italic style from the exported rule plan, then packages them in a zip.
Each rule subsets its source to owned characters, scales by size-adjust, applies baseline translation and merges; line metrics come from the Han base font.
"""
import os, re, io, json, copy, time, zipfile
from fontTools.ttLib import TTFont, TTCollection, newTable
from fontTools import subset
from fontTools.merge import Merger, Options as MergeOptions
from fontTools.ttLib.scaleUpem import scale_upem
from fontTools.varLib import instancer

MAX_GLYPHS = 65535      # Maximum glyph count per font (16-bit glyph IDs); tests use a smaller limit.
RARE = ((0x20000, 0x10FFFF), (0xF900, 0xFAFF), (0x2F800, 0x2FA1F))      # Rare Han: Extension B onward (planes 2 and 3) and compatibility ideographs.

STYLE = {100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black'}

class BakeError(Exception):
    def __init__(self, code, name=''):
        super().__init__(code); self.code = code; self.name = name

def to_otf(font):
    """Convert TrueType quadratic outlines to CFF cubic OTF. Quadratics convert exactly apart from control-point rounding, below 1/1000 em.
    Vertical origins are derived from top sidebearings and glyph tops in TrueType, but stored explicitly in CFF's VORG table."""
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
    ascii_ = lambda x: x if x and all(ord(c) < 128 for c in x) else n.getDebugName(6)      # CFF names must be ASCII; keep Chinese/Japanese names in the name table.
    info = {'FullName': ascii_(n.getDebugName(4)), 'FamilyName': ascii_(n.getDebugName(1)), 'Weight': ascii_(n.getDebugName(2)),
            'Notice': ''.join(c for c in (n.getDebugName(0) or '') if ord(c) < 128)[:500],
            'ItalicAngle': post.italicAngle, 'UnderlinePosition': post.underlinePosition, 'UnderlineThickness': post.underlineThickness}
    fb = FontBuilder(font=font); fb.isTTF = False      # FontBuilder inferred TrueType from the source; switch to CFF.
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
    """Select a TTC/OTC face by PostScript name; use the first if no name is supplied or found."""
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
        raise BakeError('outline', name)      # Bitmap-only fonts, such as emoji.

def instance_file(path, weight, fvs, out, ps=None):
    """Instantiate a variable font at this weight and fvs axis values, defaulting unspecified axes; select a collection face; return ordinary static fonts unchanged."""
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
    """Convert CFF cubic outlines to TrueType quadratics with at most one font-unit error.
    CFF stores vertical origins in VORG; recompute TrueType top sidebearings from VORG and glyph tops."""
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
    if vorg is not None and 'vmtx' in f:      # Without VORG, origins already come from sidebearings and glyph tops, so no adjustment is needed.
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
    """Give every component's GSUB / GPOS all scripts and languages used across the merge.
    With lang=ja, digits and punctuation inherit hani from surrounding Han. Western kerning exists only under DFLT/latn; adding hani stops fallback to DFLT,
    losing kerning and ligatures. Populate missing records according to HarfBuzz fallback rules before merging."""
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
    """Keep the default language and tags in keep so subsetting drops other regions' locl glyph variants.
    Return the removed language tags."""
    dropped = set()
    for tag in ('GSUB', 'GPOS'):
        if tag not in f or not f[tag].table.ScriptList: continue
        for sr in f[tag].table.ScriptList.ScriptRecord:
            recs = sr.Script.LangSysRecord
            dropped.update(l.LangSysTag for l in recs if l.LangSysTag not in keep)
            sr.Script.LangSysRecord = [l for l in recs if l.LangSysTag in keep]; sr.Script.LangSysCount = len(sr.Script.LangSysRecord)
    return sorted(t.strip() for t in dropped)

def bake(plan, srcs, family, weight, italic, lic, work, lang=None, trimmed=None):
    """plan: rules, with the Han base first; srcs: source paths in matching order, already instantiated by weight; lang: target OpenType tag, such as 'JAN '.
    Trim the Han base if glyph count exceeds MAX_GLYPHS, recording removals in trimmed. Return (TTFont, PostScript name)."""
    cmaps = [TTFont(p, lazy=True).getBestCmap() for p in srcs]
    U = TTFont(srcs[0], lazy=True)['head'].unitsPerEm      # Use the Han base font's em size.
    owners = [o for r in plan for o in r['owners']]
    custom = [o for o in owners if o['o'].startswith('#')][::-1]
    cls = [o for o in owners if not o['o'].startswith('#') and o['o'] != 'han']
    han_shift = next((o['shift'] for o in owners if o['o'] == 'han'), 0)
    def shift_of(cp):
        for o in custom + cls:
            if o['ranges'] and in_ranges(o['ranges'], cp): return o['shift']
        return han_shift
    # Assign characters as CSS does: later rules win; if their font lacks a character, fall back through earlier rules to the base.
    seg = {}
    for cp in sorted(set().union(*[set(c) for c in cmaps])):
        for i in range(len(plan) - 1, -1, -1):
            if (i == 0 or in_ranges(plan[i]['range'] or [], cp)) and cp in cmaps[i]:
                seg.setdefault((i, shift_of(cp)), []).append(cp); break
    top = TTFont(srcs[0], lazy=True)['OS/2'].sTypoAscender
    def sub_part(i, cps, level):
        """Subset at level 0 unchanged; level 1 keeps only target-language variants; level 2 also removes rare Han, only from the Han base."""
        f = TTFont(srcs[i])
        if level >= 1: trimmed_langs.update(keep_langs(f, {lang} if lang else set()))
        if level >= 2:
            rare = [c for c in cps if any(a <= c <= b for a, b in RARE)]
            trimmed_rare.update(rare); rs = set(rare); cps = [c for c in cps if c not in rs]
        o = subset.Options()
        o.layout_features = ['*']; o.layout_scripts = ['*']
        o.name_IDs = ['*']; o.name_languages = ['*']; o.name_legacy = True
        o.notdef_outline = True; o.glyph_names = True; o.hinting = False; o.legacy_kern = True
        o.drop_tables += ['STAT', 'DSIG', 'meta', 'MVAR', 'HVAR', 'VVAR', 'BASE', 'JSTF', 'COLR', 'CPAL', 'SVG ', 'sbix', 'CBDT', 'CBLC', 'EBDT', 'EBLC', 'EBSC']      # Color and bitmap glyphs cannot merge; retain outlines only.
        sub = subset.Subsetter(o); sub.populate(unicodes=cps); sub.subset(f)
        return f
    def make_part(i, s, f):
        """After subsetting: convert to TrueType outlines, scale, shift baselines and supply vertical metrics."""
        if 'glyf' not in f: cff_to_glyf(f)      # Convert only glyphs used by this component, much faster than converting the whole font.
        src_upem = f['head'].unitsPerEm
        k = plan[i]['size'] / 100 * U / src_upem
        if abs(k - 1) > 1e-6:
            scale_upem(f, round(src_upem * k))      # Multiply coordinates by k.
            f['head'].unitsPerEm = U                # Restore the original em size so glyphs are enlarged or reduced by k relative to em.
        dy = round(s / 100 * U)
        glyf = f['glyf']
        if dy:
            for gn in f.getGlyphOrder():
                g = glyf[gn]
                if g.numberOfContours > 0: g.coordinates.translate((0, dy)); g.recalcBounds(glyf)
            for gn in f.getGlyphOrder():
                g = glyf[gn]
                if g.isComposite(): g.recalcBounds(glyf)
        if 'vmtx' not in f:      # Supply missing vmtx for Western fonts, placing vertical origins at the base font's ascender.
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
    # Build other components before the Han base; if the total exceeds the glyph limit, progressively trim and resubset the Han base by level.
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
    if 'BASE' in base: font['BASE'] = base['BASE']      # Use ideographic-box and other baselines from the Han base font.
    W, it = weight, italic
    style = (('' if W == 400 else STYLE[W] + ' ') + 'Italic') if it else STYLE[W]
    font['OS/2'].usWeightClass = W
    bold = W == 700
    font['OS/2'].fsSelection = (font['OS/2'].fsSelection & ~0b1100001) | (0b100000 if bold else 0) | (1 if it else 0) | (0b1000000 if not bold and not it else 0)
    font['head'].macStyle = (1 if bold else 0) | (2 if it else 0)
    font['post'].italicAngle = 0
    if it:      # Take the italic angle from Western italics; Han remains upright.
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
            pass      # Write Chinese/Japanese names only to Windows-platform name records.
    font['name'] = name
    font['head'].fontRevision = 1.0
    return font, ps

def trim_note(trimmed, notes):
    """Describe trimming with localized templates. notes: {'head': reason, 'langs': '...{langs}...', 'rare': '...{n}...', 'names': {'KOR': 'Korean', ...}, 'sep': separator}."""
    out, names = [], notes.get('names') or {}
    if trimmed.get('langs') and notes.get('langs'):
        out.append(notes['langs'].replace('{langs}', notes.get('sep', ', ').join(names.get(t, t) for t in sorted(trimmed['langs']))))
    if trimmed.get('rare') and notes.get('rare'): out.append(notes['rare'].replace('{n}', str(len(trimmed['rare']))))
    return notes.get('head', '') + ''.join(out) if out else ''

def run_all(jobs_json, opts_json, progress):
    try:
        jobs = json.loads(jobs_json); opts = json.loads(opts_json)
        SRC, WORK = opts.get('src', '/src/'), opts.get('work', '/w/')      # Local tests replace this with a temporary directory.
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
            if opts.get('ttf', True):      # Merging always uses TrueType outlines; disabling TTF only omits that file from the zip.
                b = io.BytesIO(); font.save(b); data = b.getvalue()
                z.writestr(ps + '.ttf', data); out.append([ps + '.ttf', len(data)])
            if opts.get('woff2'):
                font.flavor = 'woff2'; b = io.BytesIO(); font.save(b); data = b.getvalue()
                z.writestr(ps + '.woff2', data); out.append([ps + '.woff2', len(data)])
            if opts.get('otf'):      # For print output, convert to CFF last; this font object is not used afterward.
                progress(n + 0.5, job['label'])
                font.flavor = None; to_otf(font)
                b = io.BytesIO(); font.save(b); data = b.getvalue()
                z.writestr(ps + '.otf', data); out.append([ps + '.otf', len(data)])
            del font
            rest = {key(s) for j in jobs[n + 1:] for s in j['srcs'] if s}      # Remove unused instantiation results to save memory.
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
