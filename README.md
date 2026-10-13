# 合成字体 · CSS Composite Font

像 InDesign / Illustrator 的「合成字体」一样，为汉字、假名、标点、半角西文、半角数字分别指定字体、大小与基线，实时校样，并导出可以直接粘贴的 CSS。

**在线使用：<https://charlie5188.github.io/css-composite-font/>**

[日本語](#日本語)

## 原理

同一个 `font-family` 名称下写多条 `@font-face`：

- `unicode-range` 决定每条规则负责哪些字符；
- `size-adjust` 调整这个字体的大小。

浏览器为每个字符从最后一条规则往前找，所以基础字体（汉字）写在最前、不限范围，其余类别写在后面接管各自的字符。

```css
@font-face { font-family: "My Composite"; src: local("PingFang SC Regular"); }
@font-face {
  font-family: "My Composite";
  src: local("Helvetica Neue");
  unicode-range: U+20-7E, U+A0-B6, U+B8-24F; /* 半角西文与数字，不含 “ ” — … */
  size-adjust: 104%;
}
```

## 功能

- 7 个字符类别和例外字符，每一类可以单独设定字体、大小和基线；没有单独设定的值会继承所跟随的类别（与 InDesign 的合成字体对话框相同）。
- 全角符号、中西共用标点可以按组切换：例如引号改由西文字体显示，破折号保持全角。
- 字体来源：Google Fonts、本机字体（`local()`）、字体文件。
- 多字重导出。汉字字体可以直接 `@import` Google Fonts，导出的 CSS 通常只有几 KB。
- 度量对齐：实测汉字字面与西文大写高、x 高的比例，一键调整西文大小。
- CSS 原生 CJK 排版属性：`text-autospace`、`text-spacing-trim`、`word-break: auto-phrase` 等，标出各浏览器的支持版本。
- 中文 / 日本語界面，深色模式。

## 浏览器支持与限制

- `size-adjust` 需要 Chrome / Edge 92+、Firefox 92+、Safari 17+。更旧的浏览器会忽略大小调整，字体分配照常生效。
- `@font-face` 没有基线描述符。设定了基线偏移时，导出会附带一小段 JS，把对应字符包进 `<span>` 移动；基线全为 0 时只需要 CSS。
- `local()` 按字体的完整名或 PostScript 名匹配。Safari 只允许网页使用系统预装字体。
- 同一个 `font-family` 里所有规则的 `font-weight` 必须写法一致（实测 Chrome 会把 `700` 和 `400 700` 分成两组），所以每个字重各生成一组规则。

## 本地运行

没有构建步骤。直接用浏览器打开 `index.html`，或者：

```sh
python3 -m http.server
```

## 文件结构

```
index.html            页面结构
assets/style.css      样式
assets/js/i18n.js     界面文字（中文 / 日本語）与工具函数
assets/js/unicode.js  Unicode 范围与字符类别
assets/js/core.js     字体加载、预设、状态、字重换算、实时预览
assets/js/render.js   类别表、校样、度量
assets/js/export.js   生成 CSS 与基线 JS
assets/js/ui.js       交互、预设卡片、字体选择、初始化
```

## 日本語

InDesign / Illustrator の「合成フォント」のように、漢字・かな・約物・半角欧文・半角数字にそれぞれフォント・サイズ・ベースラインを指定し、そのまま貼り付けられる CSS を書き出すツールです。

同じ `font-family` 名で複数の `@font-face` を書き、`unicode-range` で担当する文字を、`size-adjust` でサイズを決めます。ブラウザは後に書いた規則から順に照合するので、ベースフォント（漢字）を最初に範囲指定なしで書き、ほかのクラスを後に書きます。

- `size-adjust` は Chrome / Edge 92+、Firefox 92+、Safari 17+ が対応。古いブラウザではサイズ調整が無視されますが、フォントの割り当ては有効です。
- ベースラインシフトには対応する記述子がないため、設定したときだけ小さな JS が付きます。
- ビルド不要。`index.html` をブラウザで開くだけで動きます。

## License

[MIT](LICENSE)
