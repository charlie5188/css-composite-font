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
- Font sources: Google Fonts, installed fonts (`local()`) and font files.
- Multi-weight export. The CJK base font can be pulled in with `@import` from Google Fonts, so the exported CSS is usually a few KB.
- Variable fonts. When a class uses a variable font (Google Fonts, a font file with an `fvar` table, or a local font marked as variable), its weight can be any value, such as 430 to match the stroke weight of the CJK font. Every rule keeps the same `font-weight` step and the fine weight goes into `font-variation-settings` (Chrome 140+, Firefox 62+; Safari shows the step weight).
- Continuous weight mode. The export can declare `font-weight` as ranges so the page can use any weight from 100 to 900. All classes share the same weight segments (Chrome breaks a composite whose rules declare weights differently): variable fonts use the same file in every segment and change smoothly, static fonts sit at the nearest weight, and segments that are identical for every class are merged — with only variable fonts the whole thing is one `100 900` rule per class. The exported range can be narrowed (for example to 400–800, the range every variable font in the composite covers, so all classes get heavier together); weights outside it render at the nearest end. Google Fonts serves the same files for any range, so narrowing does not reduce download size. If the upper limit is below 600, browsers draw bold text with synthetic bold.
- Italics. Optionally exports a `font-style: italic` set: classes whose font has an italic use it (Google Fonts italics, an uploaded italic file, a local “… Italic” face, or a variable font's `slnt` / `ital` axis), and classes without one (Han, kana and so on) declare their upright file as italic so the browser does not slant them. When the Han base is linked with `@import`, the usage rule adds `font-synthesis-style: none` for the same reason.
- Other variable axes. The font picker lists a font's axes besides weight (width, grade, optical size, slant and custom axes); values apply to that class at every weight and are written into the `font-variation-settings` descriptor (Safari ignores it). Optical size can follow the font size; Chrome uses the size after `size-adjust`. Google Fonts drops axes a request doesn't name, so each tuned axis is added to the request and roughly doubles the file. Axis data for Google Fonts is bundled from its metadata; TTF, OTF and WOFF files are read directly, while WOFF2 (Brotli) can't be read in the browser.
- Width. If a font has a `wdth` axis, the export can let the page control width with `font-stretch`: every rule declares the same `font-stretch` range.
- Metric matching: measures the cap height and x-height of the Latin font against the ideographic face and adjusts the Latin size in one click.
- Native CSS properties for CJK text (`text-autospace`, `text-spacing-trim`, `word-break: auto-phrase` and more), with the browser versions that support them.
- Chinese and Japanese interface, light and dark themes.

## Browser support and limits

- `size-adjust` needs Chrome / Edge 92+, Firefox 92+ or Safari 17+. Older browsers ignore the size adjustment; the font assignment still works.
- `@font-face` has no baseline descriptor. When a baseline shift is set, the export includes a short script that wraps the affected characters in `<span>`s. With every baseline at 0, CSS alone is enough.
- `local()` matches a font's full name or PostScript name. Safari only lets web pages use fonts preinstalled with the system.
- Every rule in one `font-family` must declare `font-weight` the same way (Chrome treats `700` and `400 700` as two separate groups), so each weight gets its own set of rules.

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
```

---

## 日本語

InDesign / Illustrator の「合成フォント」のように、漢字・かな・約物・半角欧文・半角数字にそれぞれフォント・サイズ・ベースラインを指定し、校正刷りで確かめながら、そのまま貼り付けられる CSS を書き出すツールです。

### 仕組み

同じ `font-family` 名で複数の `@font-face` を書き、`unicode-range` で担当する文字を、`size-adjust` でサイズを決めます。ブラウザは後に書いた規則から順に照合するので、ベースフォント（漢字）を最初に範囲指定なしで書き、ほかのクラスを後に書きます。

### 主な機能

- 7 つの文字クラスと例外文字。クラスごとにフォント・サイズ・ベースラインを指定でき、空欄の値は従う側のクラスから継承します（InDesign の合成フォントダイアログと同じ考え方）。
- 全角記号と和欧共通の約物は、グループごとに半角欧文へ回せます。
- フォントの入手先：Google Fonts、ローカルフォント（`local()`）、フォントファイル。
- 複数ウェイトの書き出し。漢字フォントは Google Fonts を `@import` で参照できるので、書き出す CSS は通常数 KB です。
- 可変フォント。クラスのフォントが可変フォント（Google Fonts、`fvar` を含むフォントファイル、可変と指定したローカルフォント）なら、430 のような任意の太さを指定できます。規則の `font-weight` は段階のまま揃え、細かい太さは `font-variation-settings` に書き出します（Chrome 140+、Firefox 62+。Safari では段階の太さで表示）。
- 連続ウェイト。書き出す `font-weight` を範囲にして、ページで 100〜900 の任意の太さを使えます。全クラスが同じ区間分けを共有し（規則ごとに書き方が違うと Chrome で合成フォントが崩れるため）、可変フォントはどの区間も同じファイルで無段階に、静的フォントは最も近い太さで表示されます。全クラスが同じ区間はまとめるので、可変フォントだけなら各クラス `100 900` の 1 規則になります。書き出す範囲は狭められます（例：すべての可変フォントが対応する 400〜800 にすると、全クラスが同じ比率で太くなります）。範囲外の太さは最も近い端で表示されます。Google Fonts はどの範囲でも同じファイルを返すので、狭めてもダウンロード量は減りません。上限が 600 未満だと、太字はブラウザの擬似ボールドになります。
- イタリック。`font-style: italic` の組も書き出せます。イタリックのあるクラスはそれを使い（Google Fonts のイタリック、読み込んだイタリックのファイル、ローカルの「… Italic」、可変フォントの `slnt` / `ital` 軸）、ないクラス（漢字・かななど）は正体のファイルを italic として宣言して、ブラウザが擬似的に傾けないようにします。ベースの漢字フォントを `@import` で参照するときは、同じ理由で使用側の規則に `font-synthesis-style: none` を加えます。
- そのほかの可変軸。フォント選択で、太さ以外の軸（幅・グレード・オプティカルサイズ・傾き・独自の軸）を調整できます。値はそのクラスの全ウェイトに適用され、`font-variation-settings` 記述子に書かれます（Safari は無視）。オプティカルサイズは文字サイズに追従させることもでき、Chrome は `size-adjust` で拡大した後のサイズを使います。Google Fonts はリクエストにない軸を取り除くので、調整した軸はリクエストに加わり、ファイルはおよそ 2 倍になります。Google Fonts の軸の情報はメタデータから同梱し、TTF・OTF・WOFF はファイルから直接読みます（WOFF2 は Brotli 圧縮のためブラウザでは読めません）。
- 字幅。`wdth` 軸のあるフォントでは、ページの `font-stretch` で幅を変えられるように書き出せます。すべての規則に同じ `font-stretch` の範囲を書きます。
- メトリクス合わせ、CSS ネイティブの組版プロパティ、中国語・日本語の UI。

### 対応ブラウザと制限

- `size-adjust` は Chrome / Edge 92+、Firefox 92+、Safari 17+ が対応。古いブラウザではサイズ調整が無視されますが、フォントの割り当ては有効です。
- ベースラインシフトには対応する記述子がないため、設定したときだけ小さな JS が付きます。
- `local()` はフルネームか PostScript 名で照合します。Safari はシステムにプリインストールされたフォントしか使わせません。
- ビルド不要。`index.html` をブラウザで開くだけで動きます。

---

## 中文

像 InDesign / Illustrator 的「复合字体」一样，为汉字、假名、标点、半角西文、半角数字分别指定字体、大小与基线，实时校样，并导出可以直接粘贴的 CSS。

### 原理

同一个 `font-family` 名称下写多条 `@font-face`：`unicode-range` 决定每条规则负责哪些字符，`size-adjust` 调整这个字体的大小。浏览器为每个字符从最后一条规则往前找，所以基础字体（汉字）写在最前、不限范围，其余类别写在后面接管各自的字符。

### 功能

- 7 个字符类别和例外字符，每一类可以单独设定字体、大小和基线；没有单独设定的值会继承所跟随的类别（与 InDesign 的复合字体对话框相同）。
- 全角符号、中西共用标点可以按组切换：例如引号改由西文字体显示，破折号保持全角。
- 字体来源：Google Fonts、本机字体（`local()`）、字体文件。
- 多字重导出。汉字字体可以直接 `@import` Google Fonts，导出的 CSS 通常只有几 KB。
- 可变字体。某一类用的是可变字体（Google Fonts、含 `fvar` 表的字体文件、标记为可变的本机字体）时，粗细可以填任意值，例如用 430 去配汉字的笔画粗细。各条规则的 `font-weight` 保持同一档，细调的粗细写进 `font-variation-settings`（Chrome 140+、Firefox 62+；Safari 按那一档显示）。
- 连续字重模式。导出的 `font-weight` 写成范围，页面上可以用 100–900 之间的任意粗细。所有类别共用同一套分段（各条规则字重写法不一致时，Chrome 的复合字体会失效）：可变字体每段用同一个文件、无级变化，静态字体停在最接近的档位；所有类别都相同的分段会合并，全是可变字体时每个类别只有一条 `100 900` 的规则。导出范围可以缩小（例如设为所有可变字体都支持的 400–800，各类别就会一起变粗）；范围以外的粗细按最接近的端点显示。Google Fonts 不论请求什么范围都返回同样的文件，缩小范围不会减少下载量。上限低于 600 时，粗体会变成浏览器模拟的加粗。
- 斜体。可以另外导出一组 `font-style: italic` 的规则：有斜体的类别用斜体（Google Fonts 的斜体、上传的斜体文件、本机的「… Italic」，或者可变字体的 `slnt` / `ital` 轴）；没有斜体的类别（汉字、假名等）把正体文件也声明成 italic，浏览器就不会把它们模拟倾斜。汉字基础字体用 `@import` 引用时，出于同样的原因，使用规则里会加上 `font-synthesis-style: none`。
- 其他可变轴。选择字体时可以调粗细以外的轴（宽度、笔画粗细、光学尺寸、倾斜和自定义轴），对这个类别的所有字重生效，写在 `font-variation-settings` 描述符里（Safari 会忽略）。光学尺寸可以跟随字号，Chrome 用的是 `size-adjust` 放大之后的字号。Google Fonts 会去掉请求里没写的轴，所以调过的轴会加进请求，文件大约变成两倍。Google Fonts 的轴信息取自它的元数据、内置在工具里；TTF、OTF、WOFF 直接读文件，WOFF2 是 Brotli 压缩，浏览器里读不了。
- 字宽。字体有 `wdth` 轴时，可以让页面用 `font-stretch` 调宽窄：所有规则写同一个 `font-stretch` 范围。
- 度量对齐、CSS 原生 CJK 排版属性、中文 / 日本語界面、深色模式。

### 浏览器支持与限制

- `size-adjust` 需要 Chrome / Edge 92+、Firefox 92+、Safari 17+。更旧的浏览器会忽略大小调整，字体分配照常生效。
- `@font-face` 没有基线描述符。设定了基线偏移时，导出会附带一小段 JS；基线全为 0 时只需要 CSS。
- `local()` 按字体的完整名或 PostScript 名匹配。Safari 只允许网页使用系统预装字体。
- 没有构建步骤，直接用浏览器打开 `index.html` 即可。

## License

[MIT](LICENSE)
