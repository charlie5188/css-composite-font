# -*- coding: utf-8 -*-
"""Tests for assets/py/bake_core.py using small fonts from tests/fixtures (a Noto Sans JP subset with a few dozen characters, plus Jost; both OFL).

Run: pip install -r tests/requirements.txt && pytest tests/py
"""
import io, json, os, shutil, sys, zipfile
import pytest
import uharfbuzz as hb
from fontTools.ttLib import TTFont, TTCollection

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, 'assets', 'py'))
import bake_core as B      # noqa: E402

FIX = os.path.join(ROOT, 'tests', 'fixtures')
LATIN = [[0x20, 0x7E]]


def plan(latin_size=108, shift=-2, latin=True):
    """Two rules: an unrestricted Han base font and Jost for half-width Latin (scaled and shifted down). Uses the same rule-table format as the app export."""
    p = [{'font': {'family': 'Noto Sans JP'}, 'size': 100, 'range': None, 'owners': [{'o': 'han', 'ranges': None, 'shift': 0}]}]
    if latin:
        p.append({'font': {'family': 'Jost'}, 'size': latin_size, 'range': LATIN, 'owners': [{'o': 'latin', 'ranges': LATIN, 'shift': shift}]})
    return p


@pytest.fixture
def work(tmp_path):
    src = tmp_path / 'src'; src.mkdir()
    for f in os.listdir(FIX):
        if f.endswith(('.ttf', '.otf')): shutil.copy(os.path.join(FIX, f), src / f)
    w = tmp_path / 'w'; w.mkdir()
    return str(src) + '/', str(w) + '/'


def run(work, jobs, **opts):
    src, w = work
    o = {'family': 'CF Test', 'woff2': False, 'otf': False, 'lic': ['OFL text', 'https://openfontlicense.org'], 'extra': [['README.txt', 'x']], 'src': src, 'work': w}
    o.update(opts)
    res = json.loads(B.run_all(json.dumps(jobs), json.dumps(o), lambda n, label: None))
    assert 'error' not in res, res
    z = zipfile.ZipFile(w + 'out.zip')
    run.readme = z.read('README.txt').decode() if 'README.txt' in z.namelist() else ''
    return res, {n: TTFont(io.BytesIO(z.read(n))) for n in z.namelist() if n.endswith(('.ttf', '.otf'))}, z.namelist()


def job(weight=400, italic=False, p=None, latin_file='Jost[wght].ttf', base='NotoSansJP-Subset.ttf', base_ps=None):
    srcs = [{'file': base, 'name': 'Noto Sans JP', 'weight': None, 'fvs': None, 'ps': base_ps}]
    p = p or plan()
    if len(p) > 1: srcs.append({'file': latin_file, 'name': 'Jost', 'weight': weight, 'fvs': None})
    return {'weight': weight, 'italic': italic, 'label': 'x', 'plan': p, 'srcs': srcs}


def jost(weight=400, italic=False):
    path = os.path.join(FIX, 'Jost-Italic[wght].ttf' if italic else 'Jost[wght].ttf')
    f = TTFont(path)
    from fontTools.varLib import instancer
    return instancer.instantiateVariableFont(f, {'wght': weight})


def gname(font, ch):
    return font.getBestCmap()[ord(ch)]


def advance(font, ch):
    return font['hmtx'][gname(font, ch)][0]


def shape(font, text, script, lang, kern=True):
    buf = io.BytesIO(); font.save(buf)
    face = hb.Face(buf.getvalue()); f = hb.Font(face)
    b = hb.Buffer(); b.add_str(text); b.direction = 'ltr'; b.script = script; b.language = lang
    hb.shape(f, b, {'kern': kern})
    return [p.x_advance for p in b.glyph_positions]


def test_latin_is_scaled_and_shifted(work):
    _, fonts, _ = run(work, [job()])
    f = fonts['CFTest-Regular.ttf']; j = jost()
    assert abs(advance(f, 'A') - round(advance(j, 'A') * 1.08)) <= 1
    ga, gj = f['glyf'][gname(f, 'A')], j['glyf'][gname(j, 'A')]
    assert abs(ga.yMax - (round(gj.yMax * 1.08) - 20)) <= 1      # 108%, baseline -2% em = -20 units.


def test_han_and_line_metrics_come_from_base(work):
    _, fonts, _ = run(work, [job()])
    f, n = fonts['CFTest-Regular.ttf'], TTFont(os.path.join(FIX, 'NotoSansJP-Subset.ttf'))
    assert advance(f, '日') == advance(n, '日') == 1000
    a, b = f['glyf'][gname(f, '日')], n['glyf'][gname(n, '日')]
    assert (a.xMin, a.yMin, a.xMax, a.yMax) == (b.xMin, b.yMin, b.xMax, b.yMax)
    for t, k in (('hhea', 'ascent'), ('hhea', 'descent'), ('OS/2', 'sTypoAscender'), ('OS/2', 'sTypoDescender')):
        assert getattr(f[t], k) == getattr(n[t], k)
    assert 'BASE' in f or 'BASE' not in n


def test_latin_kerning_survives_han_script(work):
    """With lang=ja, digits inherit hani from neighboring Han characters. Adding hani during merging must not disable Latin kerning."""
    _, fonts, _ = run(work, [job()])
    f, j = fonts['CFTest-Regular.ttf'], jost()
    kerned, plain = shape(f, '7.', 'Hani', 'ja')[0], shape(f, '7.', 'Hani', 'ja', kern=False)[0]
    ref = shape(j, '7.', 'Latn', 'en')[0]
    assert kerned != plain, '「7.」在 hani 下没有字距'
    assert abs(kerned - round(ref * 1.08)) <= 2


def test_no_shift_no_size(work):
    _, fonts, _ = run(work, [job(p=plan(latin_size=100, shift=0))])
    f, j = fonts['CFTest-Regular.ttf'], jost()
    assert advance(f, 'H') == advance(j, 'H')
    assert f['glyf'][gname(f, 'H')].yMax == j['glyf'][gname(j, 'H')].yMax


def test_cff_source_keeps_vertical_origin(work, tmp_path):
    """Convert CFF sources to TrueType: translate vertical origins (VORG) into vmtx so vertical punctuation retains its position."""
    src, _ = work
    cff = TTFont(os.path.join(FIX, 'NotoSansJP-Subset.ttf')); B.to_otf(cff); cff.save(src + 'noto-cff.otf')
    cff = TTFont(src + 'noto-cff.otf')
    assert 'CFF ' in cff and 'VORG' in cff
    _, fonts, _ = run(work, [job(base='noto-cff.otf')])
    f = fonts['CFTest-Regular.ttf']
    assert 'glyf' in f
    for ch in '、。日ー':
        g = gname(f, ch); gl = f['glyf'][g]
        origin = f['vmtx'][g][1] + gl.yMax
        v = cff['VORG']; want = v.VOriginRecords.get(gname(cff, ch), v.defaultVertOriginY)
        assert abs(origin - want) <= 1, ch


def test_formats_independent(work):
    # OTF only: the zip contains no TTF.
    _, fonts, names = run(work, [job()], ttf=False, otf=True)
    assert 'CFTest-Regular.otf' in names and not any(n.endswith('.ttf') for n in names)


def test_otf_output(work):
    _, fonts, names = run(work, [job()], otf=True)
    assert {'CFTest-Regular.ttf', 'CFTest-Regular.otf', 'README.txt'} <= set(names)
    t, o = fonts['CFTest-Regular.ttf'], fonts['CFTest-Regular.otf']
    assert 'CFF ' in o and 'glyf' not in o and 'VORG' in o and o.sfntVersion == 'OTTO'
    assert o.getTableData('GSUB') == t.getTableData('GSUB') and o.getTableData('GPOS') == t.getTableData('GPOS')
    from fontTools.pens.boundsPen import BoundsPen
    for ch in '日A、':
        pt, po = BoundsPen(t.getGlyphSet()), BoundsPen(o.getGlyphSet())
        t.getGlyphSet()[gname(t, ch)].draw(pt); o.getGlyphSet()[gname(o, ch)].draw(po)
        assert all(abs(a - b) <= 1 for a, b in zip(pt.bounds, po.bounds)), ch


def test_ttc_picks_face_by_postscript_name(work):
    src, _ = work
    c = TTCollection(); c.fonts = [jost(), TTFont(os.path.join(FIX, 'NotoSansJP-Subset.ttf'))]
    c.save(src + 'pair.ttc')
    ps = c.fonts[1]['name'].getDebugName(6)
    assert B.open_face(src + 'pair.ttc', ps)['name'].getDebugName(6) == ps
    assert B.open_face(src + 'pair.ttc')['name'].getDebugName(6) == c.fonts[0]['name'].getDebugName(6)
    _, fonts, _ = run(work, [job(base='pair.ttc', base_ps=ps)])
    assert '日' in ''.join(map(chr, fonts['CFTest-Regular.ttf'].getBestCmap()))


def test_names_weights_and_italic(work):
    _, fonts, _ = run(work, [job(700), job(700, italic=True, latin_file='Jost-Italic[wght].ttf')], family='合成ゴシック')
    assert set(fonts) == {'CompositeFont-Bold.ttf', 'CompositeFont-BoldItalic.ttf'}
    b, bi = fonts['CompositeFont-Bold.ttf'], fonts['CompositeFont-BoldItalic.ttf']
    assert b['name'].getName(1, 3, 1, 0x409).toUnicode() == '合成ゴシック'
    assert b['name'].getName(1, 1, 0, 0) is None      # Write Chinese and Japanese names only to Windows-platform records.
    assert b['OS/2'].usWeightClass == 700 and b['head'].macStyle == 1 and b['post'].italicAngle == 0
    assert bi['head'].macStyle == 3 and bi['OS/2'].fsSelection & 1
    assert bi['post'].italicAngle == jost(italic=True)['post'].italicAngle
    assert b['name'].getDebugName(13) == 'OFL text'


def test_bitmap_only_font_is_rejected(work):
    src, w = work
    f = TTFont(os.path.join(FIX, 'NotoSansJP-Subset.ttf'))
    for t in ('glyf', 'loca'): del f[t]
    f.save(src + 'nooutline.ttf')
    o = {'family': 'x', 'woff2': False, 'otf': False, 'lic': ['', ''], 'extra': [], 'src': src, 'work': w}
    res = json.loads(B.run_all(json.dumps([job(base='nooutline.ttf')]), json.dumps(o), lambda n, l: None))
    assert res.get('error') in ('outline', 'read')


# Glyph limit: pan-CJK fonts (NotoSansCJKjp-Subset.otf contains a few dozen Noto Sans CJK JP characters, regional variants, and uncommon Han characters).
CJK = 'NotoSansCJKjp-Subset.otf'
RARE_CPS = (0x2000B, 0x20B9F, 0x2A6B2, 0xF900, 0xF901, 0xFA30)
TRIM = {'otLang': 'JAN ', 'notes': {'langs': 'dropped {langs}', 'rare': 'dropped {n} rare', 'names': {'KOR': 'Korean'}, 'sep': ', '}}


def glyph_for(font, text, lang):
    buf = io.BytesIO(); font.save(buf)
    f = hb.Font(hb.Face(buf.getvalue())); b = hb.Buffer(); b.add_str(text); b.guess_segment_properties(); b.language = lang
    hb.shape(f, b, {})
    return font.getGlyphOrder()[b.glyph_infos[0].codepoint]


@pytest.fixture
def limit(monkeypatch):
    return lambda n: monkeypatch.setattr(B, 'MAX_GLYPHS', n)


def test_glyph_limit_untouched_when_it_fits(work):
    res, fonts, _ = run(work, [job(base=CJK)], **TRIM)
    f = fonts['CFTest-Regular.ttf']
    assert 'trimmed' not in res and 'dropped' not in run.readme
    assert glyph_for(f, '直', 'ja') != glyph_for(f, '直', 'zh-Hans')      # All regional variants are present.


def test_glyph_limit_drops_other_regions_first(work, limit):
    _, fonts, _ = run(work, [job(base=CJK)], **TRIM)
    limit(fonts['CFTest-Regular.ttf']['maxp'].numGlyphs - 1)
    res, fonts, _ = run(work, [job(base=CJK)], **TRIM)
    f = fonts['CFTest-Regular.ttf']
    assert res['trimmed'] == {'langs': ['KOR', 'ZHH', 'ZHS', 'ZHT'], 'rare': 0}
    assert f['maxp'].numGlyphs <= B.MAX_GLYPHS
    ref = TTFont(os.path.join(FIX, CJK))
    assert glyph_for(f, '直', 'ja') == glyph_for(ref, '直', 'ja')          # Keep the target language's forms unchanged.
    assert glyph_for(f, '直', 'zh-Hans') == glyph_for(f, '直', 'ja')       # Remove the Simplified Chinese variant.
    assert all(c in f.getBestCmap() for c in RARE_CPS)                   # Keep the uncommon Han character.
    assert 'dropped Korean, ZHH, ZHS, ZHT' in run.readme


def test_glyph_limit_then_drops_rare_ideographs(work, limit):
    limit(10 ** 6)
    _, fonts, _ = run(work, [job(base=CJK)], **TRIM)
    limit(fonts['CFTest-Regular.ttf']['maxp'].numGlyphs - 1)
    _, fonts, _ = run(work, [job(base=CJK)], **TRIM)      # Glyph count after removing only other regional variants.
    limit(fonts['CFTest-Regular.ttf']['maxp'].numGlyphs - 1)
    res, fonts, _ = run(work, [job(base=CJK)], **TRIM)
    cmap = fonts['CFTest-Regular.ttf'].getBestCmap()
    assert res['trimmed']['rare'] == len(RARE_CPS)
    assert not any(c in cmap for c in RARE_CPS)
    assert all(ord(c) in cmap for c in '直日本語あア、') and ord('A') in cmap      # Retain common Han characters, kana, punctuation, and Latin.
    assert 'dropped 6 rare' in run.readme


def test_glyph_limit_error_when_still_too_many(work, limit):
    limit(40)
    src, w = work
    o = {'family': 'x', 'woff2': False, 'otf': False, 'lic': ['', ''], 'extra': [], 'src': src, 'work': w, **TRIM}
    res = json.loads(B.run_all(json.dumps([job(base=CJK)]), json.dumps(o), lambda n, l: None))
    assert res.get('error') == 'glyphs'
