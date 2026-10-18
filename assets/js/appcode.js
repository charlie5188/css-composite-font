/* ================= App code export (experimental) =================
   iOS, Android and Flutter have no composite fonts. Generated code splits text into character runs and assigns each a font, size and baseline shift.
   It follows the web export: EFF determines character ownership, custom characters override classes, and fonts and sizes resolve by weight.
   All three languages share appModel; only their APIs differ. App font names (PostScript names, file names and families) are guesses,
   so the generated code asks developers to verify them. Generated comments are in English for developers. */
import { CLASSES, EFF } from './unicode.js';
import { WEIGHTS, customRanges, localAlt, resolveCls, resolveCustom, state, stepSpan, vfAxisNow } from './core.js';

const W_WORD = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const hex = n => '0x' + n.toString(16).toUpperCase().padStart(4, '0');
const num = x => String(+(+x).toFixed(4));
/* Type name: 'My Composite' becomes MyComposite; use CompositeFont if the result is not a valid identifier. */
export function typeName() {
  const s = (state.name || '').replace(/[^A-Za-z0-9]+(.)?/g, (m, c) => c ? c.toUpperCase() : '').replace(/^./, c => c.toUpperCase());
  return /^[A-Za-z]\w*$/.test(s) ? s : 'CompositeFont';
}
/* Custom characters override existing ranges: remove their code points from those ranges, then add the custom ranges. */
function paint(list, rng, idx) {
  const out = [];
  for (const [a, b, i] of list) {
    let s = a;
    for (const [ra, rb] of rng) { if (rb < s || ra > b) continue; if (ra > s) out.push([s, ra - 1, i]); s = Math.max(s, rb + 1); }
    if (s <= b) out.push([s, b, i]);
  }
  return out.concat(rng.map(([a, b]) => [a, b, idx]));
}
/* Guess platform font names: PostScript name on iOS, an assets file on Android, and a pubspec family in Flutter. */
function fontEntry(f) {
  const w = f.weight || 400, vf = Array.isArray(vfAxisNow(f)), step = Math.min(900, Math.max(100, Math.round(w / 100) * 100));
  const ax = Array.isArray(vfAxisNow(f)) ? vfAxisNow(f) : f.axis, wght = ax ? Math.min(ax[1], Math.max(ax[0], w)) : null;      // Clamp variable font weights to their axis range, as browsers do for CSS.
  const step2 = ax ? 400 : step;      // Register one file per variable font and use wght for weight; normalize the stepped weight to 400 so identical fonts can merge.
  if (f.kind === 'google') {
    const stem = f.family.replace(/\s+/g, '');
    return { note: `Google Fonts: ${f.family}${vf ? ' (variable)' : ''}`, ps: `${stem}-${vf ? 'Regular' : W_WORD[step]}`, file: vf ? `${stem}[wght].ttf` : `${stem}-${W_WORD[step]}.ttf`, family: f.family, weight: step2, wght };
  }
  if (f.kind === 'local') {
    const ps = localAlt.get(f.name) || (f.alt || [])[0] || f.name;
    return { note: `installed font: ${f.name}`, ps, file: `${ps}.ttf`, family: f.name, weight: step2, wght };
  }
  const file = f.fileName || f.path || 'font.ttf', stem = file.replace(/\.[^.]+$/, '');
  return { note: `font file: ${file}`, ps: stem, file, family: stem, weight: step2, wght };
}
export function appModel() {
  const classes = [{ id: 'han' }];
  let ranges = [];
  for (const c of CLASSES) if (c.id !== 'han') {
    const i = classes.push({ id: c.id }) - 1;
    ranges.push(...(EFF[c.id] || []).map(([a, b]) => [a, b, i]));
  }
  state.custom.forEach((cu, k) => {
    const rng = customRanges[k]; if (!rng?.length) return;
    const i = classes.push({ id: '#' + k, label: `custom "${(cu.chars || '').slice(0, 12)}"`, cu }) - 1;
    ranges = paint(ranges, rng, i);
  });
  ranges.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const r of ranges) { const l = merged[merged.length - 1]; if (l && l[2] === r[2] && r[0] <= l[1] + 1) l[1] = Math.max(l[1], r[1]); else merged.push([...r]); }
  const resolve = (c, W) => c.cu ? resolveCustom(c.cu, W) : resolveCls(c.id, W);
  const weights = state.wmode === 'cont' ? WEIGHTS.filter(stepSpan) : [...state.weights].sort((a, b) => a - b);
  const fonts = [], keyOf = e => `${e.ps}|${e.file}|${e.family}|${e.weight}|${e.wght}`;
  const styles = weights.map(W => [W, classes.map(c => {
    const r = resolve(c, W), e = r.font ? fontEntry(r.font) : { note: 'system font', ps: '', file: '', family: '', weight: 400, wght: null };
    let i = fonts.findIndex(x => keyOf(x) === keyOf(e)); if (i < 0) i = fonts.push(e) - 1;
    return { font: i, scale: (r.size || 100) / 100 };
  })]);
  const shift = classes.map(c => (resolve(c, 400).shift || 0) / 100);
  return { name: typeName(), classes: classes.map(c => c.label || c.id), ranges: merged, weights, fonts, styles, shift };
}
/* Look up a class in the generated range table, using the same binary search as the platform code. Used by tests. */
export function classOfModel(m, cp) {
  let lo = 0, hi = m.ranges.length - 1;
  while (lo <= hi) { const k = (lo + hi) >> 1, r = m.ranges[k]; if (cp < r[0]) hi = k - 1; else if (cp > r[1]) lo = k + 1; else return r[2]; }
  return 0;
}
const rows = (items, per, indent) => { const out = []; for (let i = 0; i < items.length; i += per) out.push(indent + items.slice(i, i + per).join(', ')); return out.join(',\n'); };
const head = (m, c) => `${c} Composite Font Studio · "${(state.name || '').trim() || 'My Composite'}" → ${m.name}
${c} EXPERIMENTAL. There are no composite fonts on this platform, so this splits text into runs by character
${c} class and gives each run its own font, size and baseline offset, using the same rules as the web export.
${c} Font names below are guesses: check them against the font files you bundle.
${c} Classes: ${m.classes.join(', ')}. Characters not in \`ranges\` use class 0 (han, the base font).`;

/* ---------------- Swift: UIKit / AppKit NSAttributedString ---------------- */
export function buildSwift(m = appModel()) {
  return `${head(m, '//')}
//
// iOS:   label.attributedText = ${m.name}.attributed("文字 Text", size: 17)
//        label.attributedText = ${m.name}.attributed("見出し Title", size: 28, weight: 700)
// macOS: textField.attributedStringValue = ${m.name}.attributed("文字 Text", size: 15)
// Register the fonts in Info.plist (UIAppFonts) and check each PostScript name in Font Book.

import Foundation
import CoreText
#if canImport(UIKit)
import UIKit
public typealias ${m.name}PlatformFont = UIFont
#else
import AppKit
public typealias ${m.name}PlatformFont = NSFont
#endif

public enum ${m.name} {
    /// Fonts used: PostScript name, and the weight to set for variable fonts (nil = use the font as it is).
    static let fonts: [(name: String, wght: Double?)] = [
${m.fonts.map(f => `        (${JSON.stringify(f.ps)}, ${f.wght == null ? 'nil' : num(f.wght)}),  // ${f.note}`).join('\n')}
    ]
    /// For each exported weight: per class, the font (index into \`fonts\`) and the size relative to the base size.
    static let styles: [Int: [(font: Int, scale: Double)]] = [
${m.styles.map(([W, st]) => `        ${W}: [${st.map(s => `(${s.font}, ${num(s.scale)})`).join(', ')}],`).join('\n')}
    ]
    /// Baseline offset per class, in units of the base size (positive = up).
    static let shift: [Double] = [${m.shift.map(num).join(', ')}]
    /// Unicode ranges and the class they belong to, sorted.
    static let ranges: [(lo: UInt32, hi: UInt32, cls: Int)] = [
${rows(m.ranges.map(([a, b, i]) => `(${hex(a)}, ${hex(b)}, ${i})`), 4, '        ')}
    ]

    public static func classOf(_ cp: UInt32) -> Int {
        var lo = 0, hi = ranges.count - 1
        while lo <= hi {
            let mid = (lo + hi) / 2, r = ranges[mid]
            if cp < r.lo { hi = mid - 1 } else if cp > r.hi { lo = mid + 1 } else { return r.cls }
        }
        return 0
    }

    /// The text split into runs of the same class.
    public static func runs(_ text: String) -> [(text: String, cls: Int)] {
        var out: [(text: String, cls: Int)] = []
        var run = String.UnicodeScalarView(), cur = -1
        for s in text.unicodeScalars {
            let c = classOf(s.value)
            if c != cur, !run.isEmpty { out.append((String(run), cur)); run = String.UnicodeScalarView() }
            cur = c
            run.append(s)
        }
        if !run.isEmpty { out.append((String(run), cur)) }
        return out
    }

    static func font(_ i: Int, size: CGFloat) -> ${m.name}PlatformFont {
        let f = fonts[i]
        guard let base = ${m.name}PlatformFont(name: f.name, size: size) else { return .systemFont(ofSize: size) }
        guard let w = f.wght else { return base }
        let variation = [0x7767_6874: w]  // 'wght'
        #if canImport(UIKit)
        let d = base.fontDescriptor.addingAttributes([UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): variation])
        return UIFont(descriptor: d, size: size)
        #else
        let d = base.fontDescriptor.addingAttributes([NSFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): variation])
        return NSFont(descriptor: d, size: size) ?? base
        #endif
    }

    /// Attributed text in the composite font. \`weight\` picks the nearest exported weight.
    public static func attributed(_ text: String, size: CGFloat, weight: Int = 400, attributes: [NSAttributedString.Key: Any] = [:]) -> NSAttributedString {
        let w = styles.keys.min { abs($0 - weight) < abs($1 - weight) || (abs($0 - weight) == abs($1 - weight) && $0 < $1) } ?? 400
        let table = styles[w] ?? []
        let out = NSMutableAttributedString()
        for run in runs(text) {
            guard run.cls < table.count else { continue }
            let st = table[run.cls]
            var a = attributes
            a[.font] = font(st.font, size: size * CGFloat(st.scale))
            if shift[run.cls] != 0 { a[.baselineOffset] = CGFloat(shift[run.cls]) * size }
            out.append(NSAttributedString(string: run.text, attributes: a))
        }
        return out
    }
}
`;
}

/* ---------------- Kotlin: Android SpannableString ---------------- */
export function buildKotlin(m = appModel()) {
  return `${head(m, '//')}
//
// textView.text = ${m.name}.build(context, "文字 Text")
// textView.text = ${m.name}.build(context, "見出し Title", weight = 700)
// Put the font files in src/main/assets/fonts/ and match the file names below. Change the package.

package com.example.fonts

import android.content.Context
import android.graphics.Typeface
import android.os.Build
import android.text.SpannableString
import android.text.Spanned
import android.text.TextPaint
import android.text.style.MetricAffectingSpan
import android.text.style.RelativeSizeSpan
import kotlin.math.abs

object ${m.name} {
    private class F(val path: String, val wght: Float?)
    private class S(val font: Int, val scale: Float)

    /** Fonts used: file under assets, and the weight to set for variable fonts (null = use the font as it is). */
    private val FONTS = arrayOf(
${m.fonts.map(f => `        F(${JSON.stringify('fonts/' + f.file)}, ${f.wght == null ? 'null' : num(f.wght) + 'f'}),  // ${f.note}`).join('\n')}
    )
    /** For each exported weight: per class, the font (index into FONTS) and the size relative to the base size. */
    private val STYLES: Map<Int, Array<S>> = mapOf(
${m.styles.map(([W, st]) => `        ${W} to arrayOf(${st.map(s => `S(${s.font}, ${num(s.scale)}f)`).join(', ')}),`).join('\n')}
    )
    /** Baseline offset per class, in units of the base size (positive = up). */
    private val SHIFT = floatArrayOf(${m.shift.map(x => num(x) + 'f').join(', ')})
    /** Unicode ranges as (lo, hi, class) triples, sorted. */
    private val RANGES = intArrayOf(
${rows(m.ranges.map(([a, b, i]) => `${hex(a)}, ${hex(b)}, ${i}`), 4, '        ')}
    )

    fun classOf(cp: Int): Int {
        var lo = 0
        var hi = RANGES.size / 3 - 1
        while (lo <= hi) {
            val mid = (lo + hi) / 2
            if (cp < RANGES[mid * 3]) hi = mid - 1 else if (cp > RANGES[mid * 3 + 1]) lo = mid + 1 else return RANGES[mid * 3 + 2]
        }
        return 0
    }

    private val cache = HashMap<Int, Typeface>()
    private fun typeface(ctx: Context, i: Int): Typeface = cache.getOrPut(i) {
        val f = FONTS[i]
        if (Build.VERSION.SDK_INT >= 26) {
            val b = Typeface.Builder(ctx.assets, f.path)
            f.wght?.let { b.setFontVariationSettings("'wght' $it") }
            b.build() ?: Typeface.DEFAULT
        } else {
            Typeface.createFromAsset(ctx.assets, f.path)
        }
    }

    /** Text in the composite font. [weight] picks the nearest exported weight. */
    fun build(ctx: Context, text: CharSequence, weight: Int = 400): SpannableString {
        val w = STYLES.keys.minWithOrNull(compareBy<Int>({ abs(it - weight) }, { it })) ?: 400
        val table = STYLES.getValue(w)
        val out = SpannableString(text)
        var start = 0
        var cur = -1
        fun flush(end: Int) {
            if (cur < 0 || end <= start) return
            val st = table[cur]
            out.setSpan(FaceSpan(typeface(ctx, st.font)), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            if (st.scale != 1f) out.setSpan(RelativeSizeSpan(st.scale), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            if (SHIFT[cur] != 0f) out.setSpan(ShiftSpan(SHIFT[cur], st.scale), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        var i = 0
        while (i < text.length) {
            val cp = Character.codePointAt(text, i)
            val c = classOf(cp)
            if (c != cur) { flush(i); start = i; cur = c }
            i += Character.charCount(cp)
        }
        flush(text.length)
        return out
    }

    private class FaceSpan(private val face: Typeface) : MetricAffectingSpan() {
        override fun updateMeasureState(tp: TextPaint) { tp.typeface = face }
        override fun updateDrawState(tp: TextPaint) { tp.typeface = face }
    }

    /** Moves the run up by [em] times the base size. The text size here already includes RelativeSizeSpan. */
    private class ShiftSpan(private val em: Float, private val scale: Float) : MetricAffectingSpan() {
        override fun updateMeasureState(tp: TextPaint) { tp.baselineShift -= (em * tp.textSize / scale).toInt() }
        override fun updateDrawState(tp: TextPaint) { tp.baselineShift -= (em * tp.textSize / scale).toInt() }
    }
}
`;
}

/* ---------------- Dart: Flutter TextSpan ---------------- */
export function buildDart(m = appModel()) {
  return `${head(m, '//')}
//
// Text.rich(${m.name}.span('文字 Text', size: 17))
// Text.rich(${m.name}.span('見出し Title', size: 28, weight: 700))
// Declare each family in pubspec.yaml (fonts:) with the same name as below.
// Flutter text spans can't move their baseline, so \`shift\` is listed but not applied.

import 'package:flutter/painting.dart';

class ${m.name} {
  ${m.name}._();

  /// Fonts used: family as declared in pubspec.yaml, weight, and the weight to set for variable fonts (null = as it is).
  static const List<_F> _fonts = [
${m.fonts.map(f => `    _F(${JSON.stringify(f.family)}, ${f.weight}, ${f.wght == null ? 'null' : num(f.wght) + (Number.isInteger(f.wght) ? '.0' : '')}),  // ${f.note}`).join('\n')}
  ];

  /// For each exported weight: per class, the font (index into _fonts) and the size relative to the base size.
  static const Map<int, List<_S>> _styles = {
${m.styles.map(([W, st]) => `    ${W}: [${st.map(s => `_S(${s.font}, ${num(s.scale)}${Number.isInteger(s.scale) ? '.0' : ''})`).join(', ')}],`).join('\n')}
  };

  /// Baseline offset per class, in units of the base size (positive = up). Not applied: see above.
  static const List<double> shift = [${m.shift.map(x => num(x) + (Number.isInteger(x) ? '.0' : '')).join(', ')}];

  /// Unicode ranges as (lo, hi, class) triples, sorted.
  static const List<int> _ranges = [
${rows(m.ranges.map(([a, b, i]) => `${hex(a)}, ${hex(b)}, ${i}`), 4, '    ')}
  ];

  static int classOf(int cp) {
    var lo = 0, hi = _ranges.length ~/ 3 - 1;
    while (lo <= hi) {
      final mid = (lo + hi) ~/ 2;
      if (cp < _ranges[mid * 3]) {
        hi = mid - 1;
      } else if (cp > _ranges[mid * 3 + 1]) {
        lo = mid + 1;
      } else {
        return _ranges[mid * 3 + 2];
      }
    }
    return 0;
  }

  /// Text in the composite font. [weight] picks the nearest exported weight.
  static TextSpan span(String text, {double size = 16, int weight = 400, TextStyle? style}) {
    final keys = _styles.keys.toList()..sort((a, b) => (a - weight).abs() != (b - weight).abs() ? (a - weight).abs() - (b - weight).abs() : a - b);
    final table = _styles[keys.first]!;
    final base = style ?? const TextStyle();
    final children = <TextSpan>[];
    final buf = StringBuffer();
    var cur = -1;
    void flush() {
      if (cur < 0 || buf.isEmpty) return;
      final st = table[cur], f = _fonts[st.font];
      children.add(TextSpan(
        text: buf.toString(),
        style: base.copyWith(
          fontFamily: f.family,
          fontSize: size * st.scale,
          fontWeight: FontWeight.values[(f.weight ~/ 100).clamp(1, 9).toInt() - 1],
          fontVariations: f.wght == null ? null : [FontVariation('wght', f.wght!)],
        ),
      ));
      buf.clear();
    }
    for (final cp in text.runes) {
      final c = classOf(cp);
      if (c != cur) {
        flush();
        cur = c;
      }
      buf.writeCharCode(cp);
    }
    flush();
    return TextSpan(children: children);
  }
}

class _F {
  final String family;
  final int weight;
  final double? wght;
  const _F(this.family, this.weight, this.wght);
}

class _S {
  final int font;
  final double scale;
  const _S(this.font, this.scale);
}
`;
}
