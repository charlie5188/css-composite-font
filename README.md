# CSS Composite Font

Build a composite font the way InDesign and Illustrator do: assign a separate font, size and baseline to CJK ideographs, kana, punctuation, Latin and digits, proof the result live, and export CSS you can paste straight into a stylesheet.

**Try it: <https://charlie5188.github.io/css-composite-font/>**

[日本語](#日本語) · [中文](#中文)

## How it works

Several `@font-face` rules share one `font-family` name:

- `unicode-range` decides which characters each rule covers;
- `size-adjust` scales that font.

For each character the browser checks the rules from the last one backwards. The base font (CJK ideographs) comes first with no range so it covers everything else, and the other classes follow and take over their own characters.

```css
@font-face { font-family: "My Composite"; src: local("PingFang SC Regular"); }
@font-face {
  font-family: "My Composite";
  src: local("Helvetica Neue");
  unicode-range: U+20-7E, U+A0-B6, U+B8-24F; /* Latin and digits, without “ ” — … */
  size-adjust: 104%;
}
```

## Features

- Seven character classes plus custom exceptions. Each class has its own font, size and baseline; values you leave empty inherit from the class it follows, as in InDesign's composite font dialog.
- Groups inside fullwidth symbols and shared CJK/Latin punctuation can be switched one by one, for example quotes set in the Latin font while dashes stay fullwidth.
- Font sources: Google Fonts, installed fonts (`local()`, with the installed-font list in Chrome / Edge) and font files. The font picker checks coverage: it shows which character sets a font has (Latin, digits, kana, Simplified and Traditional Chinese, Japanese kanji, Hangul, symbols) and marks the glyphs it lacks in the sample. Google Fonts are checked against their `unicode-range`; installed fonts and files are measured against a bundled zero-width fallback font.
- Presets for Simplified and Traditional Chinese, Japanese, manga dialogue and the macOS system fonts (PingFang / Hiragino with Avenir Next; SF Pro can't be referenced with `local()`). Every preset's Latin sizes and baseline are the auto-adjust result for each weight 100–900; five of them (Jost, アンチゴチ and the three macOS ones) have a baseline offset, so their export includes the baseline script. Your own settings can be saved as presets in the browser.
- Multi-weight export. The fonts you set apply at 400 and the other weights are derived: Google Fonts by the same offset, installed fonts by name (W3 → W6, Regular → Bold, checked on this device), files by file name. At any weight you can change a class's size, pick the weight, name or file it uses, or switch to a different font for that weight only. The CJK base font can be pulled in with `@import` from Google Fonts, so the exported CSS is usually a few KB.
- Variable fonts. When a class uses a variable font (Google Fonts, a font file with an `fvar` table, or a local font marked as variable), its weight can be any value, such as 430 to match the stroke weight of the CJK font. Every rule keeps the same `font-weight` step and the fine weight goes into `font-variation-settings` (Chrome 140+, Firefox 62+; Safari shows the step weight).
- Continuous weight mode. The export can declare `font-weight` as ranges so the page can use any weight from 100 to 900. All classes share the same weight segments (Chrome breaks a composite whose rules declare weights differently): variable fonts use the same file in every segment and change smoothly, static fonts sit at the nearest weight, and segments that are identical for every class are merged — with only variable fonts the whole thing is one `100 900` rule per class. The exported range can be narrowed (for example to 400–800, the range every variable font in the composite covers, so all classes get heavier together); weights outside it render at the nearest end. Google Fonts serves the same files for any range, so narrowing does not reduce download size. If the upper limit is below 600, browsers draw bold text with synthetic bold.
- Italics. By default exports a `font-style: italic` set (turn it off and the browser fakes the slant for everything, Latin included): classes whose font has an italic use it (Google Fonts italics, an uploaded italic file, a local “… Italic” face, or a variable font's `slnt` / `ital` axis), and classes without one (Han, kana and so on) declare their upright file as italic so the browser does not slant them. When the Han base is linked with `@import`, the usage rule adds `font-synthesis-style: none` for the same reason.
- Other variable axes. The font picker lists a font's axes besides weight (width, grade, optical size, slant and custom axes); values apply to that class at every weight and are written into the `font-variation-settings` descriptor (Safari ignores it). Optical size can follow the font size; Chrome uses the size after `size-adjust`. Google Fonts drops axes a request doesn't name, so each tuned axis is added to the request and roughly doubles the file. Axis data for Google Fonts is bundled from its metadata; TTF, OTF and WOFF files are read directly, while WOFF2 (Brotli) can't be read in the browser.
- Numeral styles. Under advanced typography, figure style (the five InDesign options: default, tabular lining, proportional lining, proportional oldstyle, tabular oldstyle) and slashed zero are exported as one `font-variant-numeric` declaration in the usage rule (Chrome 52+, Firefox 34+, Safari 9.1+), so a page can still override it per element, for example tabular figures only in tables. The tool detects which figures the digit font uses by default and warns when a chosen style is missing from it. Google Fonts strips most OpenType features from its web fonts (no oldstyle figures or slashed zero), so use a local font or a font file for those.
- Line metrics. A composite family takes its line height and the baseline's place in the line from the rule that covers the space character, which is the Latin font (after `size-adjust`), not the CJK font. With Inter next to Noto Sans SC, CJK text sat 7% of the font size higher in the line, and with `line-height: normal` Latin-only lines were a sixth shorter than lines with CJK. By default the export gives every non-base rule the CJK base font's `ascent-override`, `descent-override` and `line-gap-override` (divided by its `size-adjust`, which scales them again), so the composite sets exactly like the CJK font (Chrome 87+, Firefox 89+; Safari ignores them).
- East Asian forms. Advanced typography also sets `font-variant-east-asian` (JIS2004 / JIS90 / JIS83 / JIS78, traditional or simplified forms, proportional or full-width kana), picked from specimen tiles. Tiles for forms the CJK font lacks are greyed; Google Fonts strips these features too.
- Metric matching: measures the cap height and x-height of the Latin font against the ideographic face and, the magic-wand button next to the class table adjusts everything in one click: the Latin size for every exported weight separately (heavier CJK strokes spread outward and look larger, so the right Latin size changes with weight: 2–5% across 100–900 in the presets), then the Latin baseline so capitals sit centred on the CJK face. Offsets under 2% em leave the baseline at 0, so the export stays pure CSS.
- Language scope. The exported rule can be limited to one language, so composites for several languages can share one stylesheet and each applies only to content in its language. Common tags are covered with `:is(:lang(…))`, because `:lang(zh-Hant)` does not match `lang="zh-TW"` (browsers don't infer the script from the region): Simplified Chinese also matches `zh-CN` and `zh-SG`, Taiwan matches `zh-TW` and plain `zh-Hant`, and Hong Kong matches `zh-HK`, `zh-Hant-HK` and the Macau tags.
- Traditional Chinese for Taiwan and Hong Kong: presets (Noto Serif TC / Noto Sans TC / Noto Sans HK, PingFang TC) and sample texts in each region's usage. The class table warns when the fonts don't fit the proof's language, and the export area when they don't fit the target language: it measures where the full-width comma sits (centred in Taiwan and Hong Kong, bottom-left in mainland China and Japan; fonts such as Noto CJK switch by `lang`, so the measurement uses the language too) and reads the region of the glyph forms from the family name (SC / TC / HK / JP). The font picker shows the punctuation position and checks Hong Kong characters (Cantonese and HKSCS).
- Zhuyin (Bopomofo). A Zhuyin class covers ㄅㄆㄇ and the tone marks ˊ ˇ ˋ ˙, which otherwise sit in the Latin range and would be drawn by the Latin font. Accented Latin letters (é, à) are different code points and stay Latin; the tone marks can be switched back to Latin from the gear.
- Native CSS properties for CJK text (`text-autospace`, `text-spacing-trim`, `word-break: auto-phrase`, `line-break`, `text-wrap` and more) are written into the exported rule, with the browser versions that support them. The defaults assume body text: `text-align: justify`, `line-break: strict` and `hanging-punctuation: allow-end`. `text-wrap: pretty` is left off because Safari's version shortens every line and disables hanging punctuation.
- Live proof with sample texts (Chinese, Japanese, mostly Latin, manga dialogue, a character table) or your own text, at any weight, with vertical writing, colour-coded classes (CSS Custom Highlight API, so the layout is not changed), ruled lines for each line box, missing-glyph marks (characters the class font lacks are tinted by whether another font in the composite or the system font ends up drawing them), italics, and a side-by-side comparison with a plain `font-family` fallback or `font-size-adjust`.
- Settings are kept in the browser; each section and the whole tool can be reset.
- Interface in Simplified Chinese, Traditional Chinese (Taiwan usage) and Japanese, light and dark themes.

## Browser support and limits

- `size-adjust` needs Chrome / Edge 92+, Firefox 92+ or Safari 17+. Older browsers ignore the size adjustment; the font assignment still works.
- `@font-face` has no baseline descriptor. When a baseline shift is set, the export includes a short script that wraps the affected characters in `<span>`s. With every baseline at 0, CSS alone is enough.
- `local()` matches a font's full name or PostScript name. Safari only lets web pages use fonts preinstalled with the system. Listing installed fonts needs the Local Font Access API (Chrome / Edge).
- Every rule in one `font-family` must declare `font-weight` the same way (Chrome treats `700` and `400 700` as two separate groups), so each weight gets its own set of rules.
- `font-variation-settings` inside `@font-face` (fine weights and fixed axis values) works in Chrome 140+ and Firefox 62+; Safari ignores it and shows the step weight and the font's default axis values.

## Run locally

There is no build step. Open `index.html` in a browser, or run:

```sh
python3 -m http.server
```

## Files

```
index.html            Markup
assets/style.css      Styles
assets/js/i18n.js     Interface text (Chinese / Japanese) and helpers
assets/js/unicode.js  Unicode ranges and character classes
assets/js/gfmeta.js   Google Fonts axes and italics (bundled from fonts.google.com/metadata)
assets/js/core.js     Font loading, presets, state, weight mapping, live preview
assets/js/render.js   Class table, proof and metrics
assets/js/export.js   CSS and baseline-script generation
assets/js/ui.js       Interaction, preset cards, font picker, start-up
tools/single.py       Builds the single-file version (everything inlined)
tools/rehash.py       Updates the ?v= cache hashes in index.html after editing assets
```

---

## 日本語

InDesign / Illustrator の「合成フォント」のように、漢字・かな・約物・半角欧文・半角数字にそれぞれフォント・サイズ・ベースラインを指定し、校正刷りで確かめながら、そのまま貼り付けられる CSS を書き出すツールです。

### 仕組み

同じ `font-family` 名で複数の `@font-face` を書き、`unicode-range` で担当する文字を、`size-adjust` でサイズを決めます。ブラウザは後に書いた規則から順に照合するので、ベースフォント（漢字）を最初に範囲指定なしで書き、ほかのクラスを後に書きます。

### 主な機能

- 7 つの文字クラスと例外文字。クラスごとにフォント・サイズ・ベースラインを指定でき、空欄の値は従う側のクラスから継承します（InDesign の合成フォントダイアログと同じ考え方）。
- 全角記号と和欧共通の約物は、グループごとに半角欧文へ回せます。
- フォントの入手先：Google Fonts、ローカルフォント（`local()`。Chrome / Edge ではインストール済みフォントの一覧から選べます）、フォントファイル。フォント選択では収録文字を確かめられ、そのフォントにある文字セット（ラテン文字・数字・かな・簡体字・繁体字・日本の漢字・ハングル・記号）を表示し、サンプル内の欠けている文字に印を付けます。Google Fonts は `unicode-range` で、ローカルフォントとファイルは同梱した幅 0 のフォールバックフォントで判定します。
- プリセット：簡体字・繁体字中国語、日本語の本文、マンガの台詞、macOS のシステムフォント（PingFang / ヒラギノ × Avenir Next。SF Pro は `local()` で参照できません）。どのプリセットも、欧文のサイズとベースラインは自動調整を 100〜900 の各ウェイトで行った結果です。うち 5 つ（Jost、アンチゴチ、macOS の 3 つ）はベースラインがずれているため、書き出しにベースライン用のスクリプトが付きます。自分の設定もブラウザにプリセットとして保存できます。
- 複数ウェイトの書き出し。設定したフォントは 400 に対応し、ほかのウェイトは自動で換算します（Google Fonts は同じ差分、ローカルフォントは名前から推測して W3 → W6、Regular → Bold などをこのデバイスで確認、ファイルはファイル名から推測）。各ウェイトで、クラスのサイズ、使う太さ・名前・ファイルを変えたり、そのウェイトだけ別のフォントにしたりできます。漢字フォントは Google Fonts を `@import` で参照できるので、書き出す CSS は通常数 KB です。
- 可変フォント。クラスのフォントが可変フォント（Google Fonts、`fvar` を含むフォントファイル、可変と指定したローカルフォント）なら、430 のような任意の太さを指定できます。規則の `font-weight` は段階のまま揃え、細かい太さは `font-variation-settings` に書き出します（Chrome 140+、Firefox 62+。Safari では段階の太さで表示）。
- 連続ウェイト。書き出す `font-weight` を範囲にして、ページで 100〜900 の任意の太さを使えます。全クラスが同じ区間分けを共有し（規則ごとに書き方が違うと Chrome で合成フォントが崩れるため）、可変フォントはどの区間も同じファイルで無段階に、静的フォントは最も近い太さで表示されます。全クラスが同じ区間はまとめるので、可変フォントだけなら各クラス `100 900` の 1 規則になります。書き出す範囲は狭められます（例：すべての可変フォントが対応する 400〜800 にすると、全クラスが同じ比率で太くなります）。範囲外の太さは最も近い端で表示されます。Google Fonts はどの範囲でも同じファイルを返すので、狭めてもダウンロード量は減りません。上限が 600 未満だと、太字はブラウザの擬似ボールドになります。
- イタリック。既定で `font-style: italic` の組も書き出します（オフにすると、欧文も含めてすべてブラウザの擬似的な傾きになります）。イタリックのあるクラスはそれを使い（Google Fonts のイタリック、読み込んだイタリックのファイル、ローカルの「… Italic」、可変フォントの `slnt` / `ital` 軸）、ないクラス（漢字・かななど）は正体のファイルを italic として宣言して、ブラウザが擬似的に傾けないようにします。ベースの漢字フォントを `@import` で参照するときは、同じ理由で使用側の規則に `font-synthesis-style: none` を加えます。
- そのほかの可変軸。フォント選択で、太さ以外の軸（幅・グレード・オプティカルサイズ・傾き・独自の軸）を調整できます。値はそのクラスの全ウェイトに適用され、`font-variation-settings` 記述子に書かれます（Safari は無視）。オプティカルサイズは文字サイズに追従させることもでき、Chrome は `size-adjust` で拡大した後のサイズを使います。Google Fonts はリクエストにない軸を取り除くので、調整した軸はリクエストに加わり、ファイルはおよそ 2 倍になります。Google Fonts の軸の情報はメタデータから同梱し、TTF・OTF・WOFF はファイルから直接読みます（WOFF2 は Brotli 圧縮のためブラウザでは読めません）。
- 数字のスタイル。詳細な組版プロパティの「数字のスタイル」（InDesign と同じ 5 種類：既定、ライニング・等幅、ライニング・プロポーショナル、オールドスタイル・プロポーショナル、オールドスタイル・等幅）と「スラッシュ付きゼロ」は、使用側の規則に 1 行の `font-variant-numeric` として書き出します（Chrome 52+、Firefox 34+、Safari 9.1+）。ページでは表だけ等幅数字にするなど、要素ごとに変えられます。ツールは数字を表示するフォントの既定の数字を調べ、選んだスタイルがそのフォントにないと知らせます。Google Fonts の Web フォントは多くの OpenType 機能が削られていて（オールドスタイル数字やスラッシュ付きゼロはない）、これらを使うにはローカルフォントかフォントファイルが必要です。
- 行のメトリクス。合成フォントの行の高さと、行の中のベースラインの位置は、スペースを受け持つ規則、つまり（size-adjust で拡大した後の）欧文フォントから決まり、漢字フォントからではありません。Noto Sans SC と Inter の組み合わせでは、漢字が行の中で文字サイズの 7% 上に寄り、`line-height: normal` では欧文だけの行が漢字のある行より 1/6 低くなりました。書き出しでは既定で、ベース以外のすべての規則に漢字フォントの `ascent-override`・`descent-override`・`line-gap-override` を書き（size-adjust がもう一度掛かるので割り戻し済み）、漢字フォントだけで組んだときと同じにします（Chrome 87+、Firefox 89+。Safari は無視）。
- 東アジアの字形。詳細な組版プロパティで `font-variant-east-asian`（JIS2004・JIS90・JIS83・JIS78、旧字体・簡略字形、かなのプロポーショナル・全角）も字形カードから選べます。漢字フォントにない字形のカードはグレーになります。Google Fonts ではこれらの機能も削られています。
- メトリクス合わせ：欧文のキャップハイトと x ハイトを漢字の字面と比べて測り、文字クラスの横の魔法の杖ボタンでまとめて調整します。書き出すウェイトごとに欧文のサイズを設定し（漢字は太いほど線が外に広がって字面が大きく見えるため、合うサイズもウェイトで変わります。プリセットでは 100〜900 で 2〜5%）、続けて大文字が漢字の字面の中央に来るようにベースラインを合わせます。ずれが 2% em 未満ならベースラインは 0 のままで、書き出しは CSS だけです。
- 対象の言語。書き出す規則を 1 つの言語に限定できるので、言語ごとの合成フォントを 1 つのスタイルシートにまとめても、それぞれがその言語の内容にだけ効きます。`:lang(zh-Hant)` は `lang="zh-TW"` に一致しない（ブラウザは地域から文字体系を推測しない）ため、`:is(:lang(…))` でよく使われる書き方をまとめて指定します。簡体字は `zh-CN`・`zh-SG`、台湾は `zh-TW` と地域なしの `zh-Hant`、香港は `zh-HK`・`zh-Hant-HK` とマカオの書き方にも一致します。
- 台湾・香港の繁体字中国語。プリセット（Noto Serif TC / Noto Sans TC / Noto Sans HK、PingFang TC）と、それぞれの地域の言い回しで書いたサンプル文があります。フォントが校正刷りの言語に合わないときは文字クラスの表で、対象の言語に合わないときは書き出し欄で知らせます。全角の読点の位置を測り（台湾・香港は中央、中国大陸・日本は左下寄り。Noto CJK のように `lang` で切り替わるフォントがあるので、測るときも言語を指定）、字形の地域はファミリー名（SC / TC / HK / JP）から判断します。フォント選択では句読点の位置を表示し、香港の字（広東語・HKSCS）の収録も確かめます。
- 注音符号。注音のクラスが ㄅㄆㄇ と声調記号 ˊ ˇ ˋ ˙ を受け持ちます（声調記号はもとは欧文の範囲にあり、移さないと欧文フォントで表示されます）。アクセント付きの欧文字（é・à）は別の符号位置なので欧文のままで、声調記号は歯車から欧文に戻せます。
- CSS ネイティブの組版プロパティ（`text-autospace`、`text-spacing-trim`、`word-break: auto-phrase`、`line-break`、`text-wrap` など）を、対応ブラウザのバージョンとともに書き出す規則に含めます。初期値は本文を想定し、`text-align: justify`、`line-break: strict`、`hanging-punctuation: allow-end` です。`text-wrap: pretty` は使いません。Safari の pretty は各行を短く組み、ぶら下がりも効かなくなるためです。
- 校正刷り：サンプル文（中国語・日本語・欧文中心・マンガの台詞・文字表）または自分の文で、任意のウェイトで確認できます。縦組み、クラスの色分け（CSS Custom Highlight API を使うので組版は変わりません）、行の罫線、欠字の表示（クラスのフォントにない文字を、合成フォントのほかのフォントで代わりに表示されるか、システムフォントまで落ちるかで色分け）、イタリック、通常の `font-family` フォールバックや `font-size-adjust` との比較にも対応します。
- 設定はブラウザに保存され、項目ごと・全体のリセットができます。
- 簡体字中国語・繁体字中国語（台湾の用語）・日本語の UI、ライト・ダークテーマ。

### 対応ブラウザと制限

- `size-adjust` は Chrome / Edge 92+、Firefox 92+、Safari 17+ が対応。古いブラウザではサイズ調整が無視されますが、フォントの割り当ては有効です。
- ベースラインシフトには対応する記述子がないため、設定したときだけ小さな JS が付きます。
- `local()` はフルネームか PostScript 名で照合します。Safari はシステムにプリインストールされたフォントしか使わせません。インストール済みフォントの一覧には Local Font Access API（Chrome / Edge）が必要です。
- 同じ `font-family` の規則はすべて同じ書き方で `font-weight` を宣言する必要があります（Chrome は `700` と `400 700` を別のグループとして扱います）。そのためウェイトごとに規則を 1 組ずつ書き出します。
- `@font-face` 内の `font-variation-settings`（細かい太さと固定した軸の値）は Chrome 140+、Firefox 62+ が対応。Safari は無視し、段階の太さとフォントの既定の軸の値で表示します。
- ビルド不要。`index.html` をブラウザで開くだけで動きます。

---

## 中文

像 InDesign / Illustrator 的「复合字体」一样，为汉字、假名、标点、半角西文、半角数字分别指定字体、大小与基线，实时校样，并导出可以直接粘贴的 CSS。

### 原理

同一个 `font-family` 名称下写多条 `@font-face`：`unicode-range` 决定每条规则负责哪些字符，`size-adjust` 调整这个字体的大小。浏览器为每个字符从最后一条规则往前找，所以基础字体（汉字）写在最前、不限范围，其余类别写在后面接管各自的字符。

### 功能

- 7 个字符类别和例外字符，每一类可以单独设定字体、大小和基线；没有单独设定的值会继承所跟随的类别（与 InDesign 的复合字体对话框相同）。
- 全角符号、中西共用标点可以按组切换：例如引号改由西文字体显示，破折号保持全角。
- 字体来源：Google Fonts、本机字体（`local()`；Chrome / Edge 可以从本机字体列表里选）、字体文件。选择字体时会检查字符覆盖：显示这个字体有哪些字符集（拉丁字母、数字、假名、简体中文、繁体中文、日本汉字、韩文、全角符号），并在样张里标出缺的字。Google Fonts 看它的 `unicode-range`；本机字体和字体文件用内置的宽度为 0 的回退字体来测。
- 预设：简体、繁体中文和日文正文，漫画对白，macOS 系统字体（苹方 / 冬青黑体 × Avenir Next；SF Pro 无法用 `local()` 引用）。所有预设的西文大小和基线，都是在 100–900 各字重上自动调整的结果；其中 5 个（Jost、アンチゴチ和 3 个 macOS 预设）设了基线，导出时会附带基线脚本。自己的设定也可以存为预设，保存在浏览器里。
- 多字重导出。设定的字体对应 400，其他字重自动换算：Google Fonts 按同样的差值，本机字体按名称推测（W3 → W6、Regular → Bold 等，并在这台电脑上检测），字体文件按文件名推测。在任何一个字重下，都可以改某个类别的大小、指定它用的粗细 / 名称 / 文件，或者只在这个字重换成另一个字体。汉字字体可以直接 `@import` Google Fonts，导出的 CSS 通常只有几 KB。
- 可变字体。某一类用的是可变字体（Google Fonts、含 `fvar` 表的字体文件、标记为可变的本机字体）时，粗细可以填任意值，例如用 430 去配汉字的笔画粗细。各条规则的 `font-weight` 保持同一档，细调的粗细写进 `font-variation-settings`（Chrome 140+、Firefox 62+；Safari 按那一档显示）。
- 连续字重模式。导出的 `font-weight` 写成范围，页面上可以用 100–900 之间的任意粗细。所有类别共用同一套分段（各条规则字重写法不一致时，Chrome 的复合字体会失效）：可变字体每段用同一个文件、无级变化，静态字体停在最接近的档位；所有类别都相同的分段会合并，全是可变字体时每个类别只有一条 `100 900` 的规则。导出范围可以缩小（例如设为所有可变字体都支持的 400–800，各类别就会一起变粗）；范围以外的粗细按最接近的端点显示。Google Fonts 不论请求什么范围都返回同样的文件，缩小范围不会减少下载量。上限低于 600 时，粗体会变成浏览器模拟的加粗。
- 斜体。默认另外导出一组 `font-style: italic` 的规则（关掉的话，西文在内的所有字都由浏览器模拟倾斜）：有斜体的类别用斜体（Google Fonts 的斜体、上传的斜体文件、本机的「… Italic」，或者可变字体的 `slnt` / `ital` 轴）；没有斜体的类别（汉字、假名等）把正体文件也声明成 italic，浏览器就不会把它们模拟倾斜。汉字基础字体用 `@import` 引用时，出于同样的原因，使用规则里会加上 `font-synthesis-style: none`。
- 其他可变轴。选择字体时可以调粗细以外的轴（宽度、笔画粗细、光学尺寸、倾斜和自定义轴），对这个类别的所有字重生效，写在 `font-variation-settings` 描述符里（Safari 会忽略）。光学尺寸可以跟随字号，Chrome 用的是 `size-adjust` 放大之后的字号。Google Fonts 会去掉请求里没写的轴，所以调过的轴会加进请求，文件大约变成两倍。Google Fonts 的轴信息取自它的元数据、内置在工具里；TTF、OTF、WOFF 直接读文件，WOFF2 是 Brotli 压缩，浏览器里读不了。
- 数字样式。高级排版属性里的「数字样式」（和 InDesign 一样的五种：默认、等高等宽、等高比例、旧式比例、旧式等宽）和「斜线零」，导出为使用规则里的一条 `font-variant-numeric`（Chrome 52+、Firefox 34+、Safari 9.1+），页面上还可以按元素改，比如只让表格用等宽数字。工具会检测显示数字的字体默认是哪种数字，选了它没有的样式时会提示。Google Fonts 的网页字体删掉了大部分 OpenType 特性（没有旧式数字和斜线零），要用这些请改用本机字体或字体文件。
- 行高度量。合成字体的行高和基线在行里的位置，取自负责空格的那条规则，也就是（size-adjust 放大之后的）西文字体，不是汉字字体。Noto Sans SC 配 Inter 时，汉字在行里偏上了字号的 7%；`line-height: normal` 时，只有西文的行比有汉字的行矮 1/6。导出时默认给基础字体以外的规则写上汉字字体的 `ascent-override`、`descent-override`、`line-gap-override`（size-adjust 会再乘一次，已经除掉），排出来和纯汉字字体完全一样（Chrome 87+、Firefox 89+；Safari 会忽略）。
- 东亚字形。高级排版属性里还可以用字样卡片选 `font-variant-east-asian`（JIS2004 / JIS90 / JIS83 / JIS78、旧字形 / 简化字形、假名的比例宽 / 全角）。汉字字体没有的字形，卡片显示成灰色；Google Fonts 同样删掉了这些特性。
- 度量对齐：测量西文的大写高和 x 高，与汉字字面比较，字符类别旁的魔法棒按钮一键调整：先为每个导出的字重分别设定西文大小（汉字越粗，笔画往外扩，字面看起来越大，合适的西文大小也跟着变，各预设在 100–900 之间相差 2–5%），再调西文基线，让大写字母落在汉字字面的正中。偏差小于 2% em 时基线保持 0，导出仍是纯 CSS。
- 适用语言。导出的规则可以限定在一种语言里，不同语言的复合字体可以写在同一个样式表里，各自只对自己语言的内容生效。`:lang(zh-Hant)` 匹配不到 `lang="zh-TW"`（浏览器不会从地区推出文字），所以用 `:is(:lang(…))` 把常见写法都包进去：简体中文另匹配 `zh-CN`、`zh-SG`，台湾匹配 `zh-TW` 和不带地区的 `zh-Hant`，香港匹配 `zh-HK`、`zh-Hant-HK` 和澳门的写法。
- 台湾、香港的繁体中文：预设（Noto Serif TC / Noto Sans TC / Noto Sans HK、苹方-繁）和按各地用语写的示例文字。字体和校样的语言不符时，类别表里会提示；和适用语言不符时，导出区会提示：量全角逗号的位置（台湾、香港居中，大陆、日本靠左下；Noto CJK 这类字体会按 `lang` 切换，所以测量时也带上语言），并按字族名（SC / TC / HK / JP）判断字形的地区。选择字体时会显示标点位置，并检查香港字（粤语用字、HKSCS）的覆盖。
- 注音符号。注音这一类负责 ㄅㄆㄇ 和声调号 ˊ ˇ ˋ ˙（声调号原本在西文的区段里，不归过来就会用西文字体显示）。带重音的西文字母（é、à）是另外的码位，仍归西文；声调号也可以在齿轮里改回西文。
- CSS 原生 CJK 排版属性（`text-autospace`、`text-spacing-trim`、`word-break: auto-phrase`、`line-break`、`text-wrap` 等）会写进导出的规则，并注明支持的浏览器版本。默认值以正文为前提：`text-align: justify`、`line-break: strict`、`hanging-punctuation: allow-end`。不用 `text-wrap: pretty`：Safari 的 pretty 会把每行排短，还会让标点悬挂失效。
- 实时校样：示例文字（中文、日文、西文为主、漫画对白、字符表）或自己的文字，可以切换任意字重；支持竖排、类别着色（用 CSS Custom Highlight API，不改变排版）、行线、缺字标注（本类别的字体没有的字，按「由合成字体里的其他字体代替」和「落到系统字体」两级着色）、斜体，以及和普通 `font-family` 回退、`font-size-adjust` 做法的对照。
- 设定保存在浏览器里；每一块和整个工具都可以重置。
- 简体中文、繁体中文（台湾用语）、日本語界面，浅色和深色模式。

### 浏览器支持与限制

- `size-adjust` 需要 Chrome / Edge 92+、Firefox 92+、Safari 17+。更旧的浏览器会忽略大小调整，字体分配照常生效。
- `@font-face` 没有基线描述符。设定了基线偏移时，导出会附带一小段 JS；基线全为 0 时只需要 CSS。
- `local()` 按字体的完整名或 PostScript 名匹配。Safari 只允许网页使用系统预装字体。读取本机字体列表需要 Local Font Access API（Chrome / Edge）。
- 同一个 `font-family` 里的所有规则必须用同样的写法声明 `font-weight`（Chrome 会把 `700` 和 `400 700` 当成两组），所以每个字重各写一组规则。
- `@font-face` 里的 `font-variation-settings`（细调的粗细、固定的轴值）Chrome 140+、Firefox 62+ 支持；Safari 会忽略，按那一档的粗细和字体默认的轴值显示。
- 没有构建步骤，直接用浏览器打开 `index.html` 即可。

## License

[MIT](LICENSE)
