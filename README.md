# Composite Font Workshop

复合字体工坊 · 複合字型工坊 · 合成フォント工房

Build a composite font the way InDesign does: a separate font, size and baseline for CJK ideographs, kana, punctuation, Western text and digits, tuned for every weight, proofed live, and exported as CSS for the web or as font files for apps that have no composite fonts.

**Try it: <https://charlie5188.github.io/css-composite-font/>** The interface is in English, 简体中文, 繁體中文 and 日本語.

[日本語](#日本語) · [中文](#中文)

## Why

A plain `font-family` fallback picks fonts, but it can't make the Western font a little larger to match the CJK character face, decide whether quotes and dashes come from the CJK or the Western font, or keep the balance right as text gets bolder. This tool does all of that with standard CSS, so it works in every current browser.

## Highlights

- **Per character class.** CJK ideographs, kana, Western text, digits, full-width punctuation, symbols, punctuation shared by CJK and Western text, and Zhuyin each get their own font, size and baseline, plus your own exception characters.
- **Weight-aware.** Settings made at 400 carry over to every weight; a weights table shows and tunes size and weight per weight. Variable fonts can take any weight, and a continuous mode lets pages use any `font-weight`.
- **Auto-adjust.** One click measures the fonts and sets the Western size for each weight and the baseline so capitals sit centred on the CJK character face.
- **Three outputs.** Paste-ready CSS (usually a few KB, the CJK font linked from Google Fonts); TTF / OTF / WOFF2 files baked in the browser for Figma, Keynote, Word and the like; and, experimentally, Swift / Kotlin / Flutter code that applies the same rules in native apps.
- **Any font.** Google Fonts, installed fonts or uploaded files, with coverage checks and missing glyphs marked in the proof.
- **Regionally correct.** Checks glyph forms and punctuation position for Simplified, Taiwan, Hong Kong and Japanese text, can scope the CSS to one language, and exports native CJK typography properties such as `text-autospace` and `line-break`.

## How it works

Several `@font-face` rules share one family name. `unicode-range` decides which characters each rule covers and `size-adjust` scales that font; the base CJK font comes first with no range, and the other classes take over their own characters.

```css
@font-face { font-family: "My Composite"; src: local("PingFang SC Regular"); }
@font-face {
  font-family: "My Composite";
  src: local("Helvetica Neue");
  unicode-range: U+20-7E, U+A0-B6, U+B8-24F;
  size-adjust: 104%;
}
```

`size-adjust` needs Chrome / Edge 92+, Firefox 92+ or Safari 17+. A baseline shift needs a small script, which the export adds only when you set one. The About dialog in the app (原理与限制 / 原理與限制 / 仕組みと制限) covers the details and limits.

## Development

No build step: `python3 tools/serve.py` serves the page at http://127.0.0.1:8765/. `npm run setup` once, then `npm run verify` runs every check CI runs. Conventions and code layout are in [AGENTS.md](AGENTS.md).

## 日本語

**合成フォント工房**は、InDesign の合成フォントのように、漢字・かな・約物・欧文・数字にそれぞれフォント・サイズ・ベースラインを指定し、ウェイトごとに調整して、校正刷りで確かめながら書き出すツールです。書き出しは Web 用の CSS と、合成フォントが使えないアプリ向けのフォントファイルの 2 種類です。

- **文字クラスごとの設定。** 漢字・かな・欧文・数字・約物・記号・和欧共通の約物・注音に、それぞれフォント・サイズ・ベースラインを指定できます。例外文字も追加できます。
- **ウェイト対応。** 400 で決めた設定がすべてのウェイトに引き継がれ、「ウェイト別」の表でウェイトごとにサイズと太さを調整できます。可変フォントは任意の太さに対応し、連続モードならページで任意の `font-weight` を使えます。
- **自動調整。** ワンクリックでフォントを測り、ウェイトごとの欧文サイズと、大文字が漢字の字面の中央に来るベースラインを設定します。
- **3 種類の書き出し。** そのまま貼れる CSS（漢字フォントを Google Fonts から読み込めば通常数 KB）、ブラウザ内で生成する TTF / OTF / WOFF2（Figma、Keynote、Word など向け）、そして試験的に、同じ規則をネイティブアプリで使うための Swift / Kotlin / Flutter のコード。
- **どのフォントでも。** Google Fonts、ローカルフォント、アップロードしたファイルに対応し、収録範囲の確認と、校正刷りでの欠け字の表示があります。
- **地域ごとの正しさ。** 簡体字・台湾・香港・日本語の字形と約物の位置を確認し、CSS を言語で限定したり、`text-autospace` や `line-break` などの CJK 組版プロパティも書き出したりできます。

## 中文

**复合字体工坊**像 InDesign 的复合字体一样，为汉字、假名、标点、西文、数字分别指定字体、大小和基线，按字重微调，实时校样，然后导出：网页用的 CSS，或者给不支持复合字体的软件用的字体文件。

- **按字符类别设定。** 汉字、假名、西文、数字、标点、符号、中西共用标点、注音各自指定字体、大小和基线，还能添加例外字符。
- **照顾到每个字重。** 在 400 设定的内容会推算到所有字重，「各字重」一览表里可以按字重调整大小和粗细。可变字体可以用任意粗细，连续模式下页面可以用任意 `font-weight`。
- **自动调整。** 一键测量字体，按字重设定西文大小，并调整基线，让大写字母落在汉字字面的正中。
- **三种导出。** 可以直接粘贴的 CSS（汉字字体从 Google Fonts 引用时通常只有几 KB）；在浏览器里生成的 TTF / OTF / WOFF2 字体文件，给 Figma、Keynote、Word 等软件用；以及实验性的 Swift / Kotlin / Flutter 代码，在原生 App 里按同样的规则排字。
- **什么字体都能用。** Google Fonts、本机字体、上传的字体文件都可以，会检查字符覆盖范围，并在校样里标出缺字。
- **照顾地区差异。** 检查简体、台湾、香港、日文的字形和标点位置，可以把 CSS 限定在某个语言，也会导出 `text-autospace`、`line-break` 等 CJK 排版属性。

## License

[MIT](LICENSE)
