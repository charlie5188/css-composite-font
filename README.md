# Composite Font Studio

复合字体工坊 · 複合字型工坊 · 合成フォント工房

Combine CJK and Western fonts with separate sizes, baselines and weights, then export the result for websites or design apps—like InDesign’s composite fonts.

**[Try it in your browser](https://charlie5188.github.io/css-composite-font/)** · English / 简体中文 / 繁體中文 / 日本語

[日本語](#日本語) · [简体中文](#简体中文) · [繁體中文](#繁體中文)

## Why

A `font-family` fallback chooses a font for each character, but does not balance their size or baseline. Composite Font Studio lets you tune that balance and keep it consistent across weights.

## Highlights

- **Compose by character class.** Choose fonts, sizes and baselines for Han, kana, Western text, digits and punctuation, with custom exception characters.
- **Match fonts across weights.** Auto-adjust size, baseline and available weights, then fine-tune individual steps or use a continuous variable-font range.
- **Bring your fonts.** Search Google Fonts and installed families, or import font files. Inspect font information and character-set coverage before applying a choice.
- **Proof as you work.** Edit proof text directly and check mixed-script text, missing glyphs and regional typography in a live preview.
- **Export where you need it.** Generate CSS or TTF / OTF / WOFF2 files for design and office apps. Swift / Kotlin / Flutter code export is experimental.
- **Save and share.** Keep presets in your browser or share an editable configuration link without an account.

## Important notes

- Font processing runs in your browser; font files are not uploaded. Installed-font access requires Chrome or Edge and permission; imported files must be supplied again after reloading.
- Share links contain configuration, not font files or custom proof text. Recipients need access to the same fonts, and font licenses still apply.
- Coverage counts characters, not regional glyph forms. Font files do not carry the app’s text-layout settings; see **About** in the app for coverage and export limitations.

## Development

No build step. Run `python3 tools/serve.py` and open <http://127.0.0.1:8765/>.

Run `npm run setup` once, then `npm run verify` for the full checks. See [AGENTS.md](AGENTS.md) for development conventions and commands.

## 日本語

**合成フォント工房**は、InDesign の合成フォントのように、和文と欧文のフォント・サイズ・ベースライン・ウェイトを組み合わせ、Web やデザインアプリ向けに書き出すツールです。

### 主な機能

- **文字クラスごとに組み合わせる。** 漢字・かな・欧文・数字・約物のフォント、サイズ、ベースラインを指定でき、例外文字も追加できます。
- **ウェイトを通してバランスを整える。** サイズ・ベースライン・利用可能なウェイトを自動調整し、段階ごとの微調整や可変フォントの連続範囲にも対応します。
- **手持ちのフォントを使う。** Google Fonts とインストール済みフォントを検索し、ファイルも取り込めます。適用前にフォント情報や文字セットの収録率を確認できます。
- **編集しながら校正する。** 校正テキストを直接編集し、和欧混植、欠字、地域ごとの組版をリアルタイムで確認できます。
- **用途に合わせて書き出す。** CSS や、デザイン・オフィスアプリ向けの TTF / OTF / WOFF2 を生成します。Swift / Kotlin / Flutter コードの書き出しは試験的な機能です。
- **保存して共有する。** ブラウザにプリセットを保存し、アカウントなしで編集可能な設定リンクを共有できます。

### 利用時の注意

- フォント処理はブラウザ内で行い、ファイルをアップロードしません。インストール済みフォントの読み取りには Chrome または Edge と許可が必要です。取り込んだファイルは再読み込み後に再指定してください。
- 共有リンクに含まれるのは設定だけで、フォントファイルや独自の校正テキストは含みません。受信側でも同じフォントを用意し、各フォントのライセンスに従う必要があります。
- 収録率は文字の有無を数えるもので、地域の字体規格を保証しません。フォントファイルに組版設定は含まれません。詳しい収録率・書き出しの制限は、アプリ内の「仕組みと制限」を参照してください。

## 简体中文

**复合字体工坊**像 InDesign 的复合字体一样，为中西文字体分别调整大小、基线和字重，再导出到网页或设计软件中使用。

### 功能亮点

- **按字符类别搭配。** 为汉字、假名、西文、数字和标点分别选择字体、大小与基线，也能添加例外字符。
- **匹配不同字重。** 自动调整大小、基线和可用字重，再按档微调；也支持可变字体的连续字重范围。
- **使用已有字体。** 搜索 Google Fonts 和本机字体，或导入字体文件；选用前可查看字体资料与字符集覆盖率。
- **边编辑边校样。** 直接编辑校样正文，实时检查中西文混排、缺字和地区排版差异。
- **导出到需要的地方。** 生成 CSS，或供设计、办公软件使用的 TTF / OTF / WOFF2 文件；Swift / Kotlin / Flutter 代码导出为实验功能。
- **保存与分享。** 在浏览器中保存预设，或分享可继续编辑的配置链接，无须账号。

### 使用须知

- 字体处理在浏览器内完成，不上传字体文件。读取本机字体需要 Chrome 或 Edge 及授权；刷新后需重新提供导入文件。
- 分享链接只包含配置，不含字体文件和自定义校样正文；接收方需能使用相同字体，并遵守字体授权。
- 覆盖率统计字符是否存在，不代表当地字形规范。字体文件不包含应用中的文字排版设置；覆盖检测与导出的详细限制见应用内“原理与限制”。

## 繁體中文

**複合字型工坊**像 InDesign 的複合字型一樣，分別調整中西文字型的大小、基線與字重，再匯出至網頁或設計軟體使用。

### 功能亮點

- **依字元類別搭配。** 為漢字、假名、西文、數字與標點分別選擇字型、大小及基線，也能新增例外字元。
- **搭配不同字重。** 自動調整大小、基線與可用字重，再依各段微調；也支援可變字型的連續字重範圍。
- **使用現有字型。** 搜尋 Google Fonts 與本機字型，或匯入字型檔案；選用前可查看字型資訊與字元集涵蓋率。
- **編輯時即時校樣。** 直接編輯校樣內文，即時檢查中西文混排、缺字及地區排版差異。
- **匯出至需要的地方。** 產生 CSS，或供設計、辦公軟體使用的 TTF / OTF / WOFF2 檔案；Swift / Kotlin / Flutter 程式碼匯出為實驗功能。
- **儲存與分享。** 在瀏覽器中儲存預設集，或分享可繼續編輯的設定連結，無須帳號。

### 使用須知

- 字型處理皆在瀏覽器內完成，不上傳字型檔案。讀取本機字型需要 Chrome 或 Edge 及授權；重新載入後須再次提供匯入檔案。
- 分享連結僅包含設定，不含字型檔案與自訂校樣內文；接收方須能使用相同字型，並遵守字型授權。
- 涵蓋率統計字元是否存在，不代表當地字形標準。字型檔案不包含應用程式中的文字排版設定；涵蓋率檢查與匯出的詳細限制，請見應用程式內的「原理與限制」。

## License

[MIT](LICENSE)
