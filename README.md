# Composite Font Studio

复合字体工坊 · 複合字型工坊 · 合成フォント工房

Build a composite font the way InDesign does: a separate font, size and baseline for CJK ideographs, kana, punctuation, Western text and digits, tuned for every weight, proofed live, and exported as CSS for the web or as font files for apps that have no composite fonts.

**Try it: <https://charlie5188.github.io/css-composite-font/>** The interface is in English, 简体中文, 繁體中文 and 日本語.

[日本語](#日本語) · [简体中文](#简体中文) · [繁體中文](#繁體中文)

## Why

A plain `font-family` fallback picks fonts, but it can't make the Western font a little larger to match the CJK character face, decide whether quotes and dashes come from the CJK or the Western font, or keep the balance right as text gets bolder. This tool does all of that with standard CSS, so it works in every current browser.

## Highlights

- **Per character class.** CJK ideographs, kana, Western text, digits, full-width punctuation, symbols, punctuation shared by CJK and Western text, and Zhuyin each get their own font, size and baseline, plus your own exception characters. Type size and baseline values directly, or use the up/down arrows to adjust them by 0.5.
- **Weight-aware.** Settings made at 400 carry over to every weight; a weights table shows and tunes size and weight per weight. For variable fonts, type any weight or use the arrows on the right or keyboard ↑↓ to adjust it by 10 (Shift + ↑↓ for 100). Static Google Fonts step by 100, skipping unavailable weights. Arrows appear on hover or focus and stay visible on touch screens; the numbers stay aligned as the arrows appear or disappear. A continuous mode lets pages use any `font-weight`. Click empty space in any row to preview that weight without changing the export selection. Changing fonts or followed classes in stepped mode unchecks export weights outside the actual mappings’ known ranges. Valid mappings and unknown ranges are kept; undo or select weights again to restore them. The reset button beside a class heading restores its base size, baseline and adjustable weight and clears its per-weight overrides. It keeps the base font choice and other classes, and can be undone.
- **Auto-adjust.** Match independently chosen Western, digit, kana, punctuation, symbol and Zhuyin fonts by class. Western text uses the Han font; independent digits use the fitted Western text; CJK classes use corresponding characters in the Han font. Following classes inherit, and supported single-class exception groups use their original class. Missing references and mixed exception groups keep their settings and are reported. Size and baseline are fitted in both modes; stepped mode can also choose closer available weights. Results can be fine-tuned or undone in one step. Notices slide in from the bottom, pause, then fade out; reduced motion disables animation. Weight matching also works in older browsers. If a selected additional variation axis cannot be measured, that class keeps its settings and is reported.
- **Three outputs.** Paste-ready CSS (usually a few KB, the CJK font linked from Google Fonts); TTF / OTF / WOFF2 files baked in the browser for Figma, Keynote, Word and the like; and, experimentally, Swift / Kotlin / Flutter code that applies the same rules in native apps.
- **Any font.** Google Fonts, installed fonts or uploaded files, with coverage checks and missing glyphs marked in the proof. Font names show “Continuous weights” or “Stepped weights” alongside their known range or fixed values.
- **Regionally correct.** Checks glyph forms and punctuation position for Simplified, Taiwan, Hong Kong and Japanese text, can scope the CSS to one language, and exports native CSS properties from the Text layout tab, such as `text-autospace` and `line-break`.


## Development

No build step: `python3 tools/serve.py` serves the page at http://127.0.0.1:8765/. `npm run setup` once, then `npm run verify` runs every check CI runs. Conventions and code layout are in [AGENTS.md](AGENTS.md).

## 日本語

**合成フォント工房**は、InDesign の合成フォントのように、漢字・かな・約物・欧文・数字にそれぞれフォント・サイズ・ベースラインを指定し、ウェイトごとに調整して、校正刷りで確かめながら書き出すツールです。書き出しは Web 用の CSS と、合成フォントが使えないアプリ向けのフォントファイルの 2 種類です。

- **文字クラスごとの設定。** 漢字・かな・欧文・数字・約物・記号・和欧共通の約物・注音に、それぞれフォント・サイズ・ベースラインを指定できます。例外文字も追加できます。サイズとベースラインは数値を直接入力するか、上下の矢印で 0.5 ずつ調整できます。
- **ウェイト対応。** 400 で決めた設定がすべてのウェイトに引き継がれ、「ウェイト別」の表でウェイトごとにサイズと太さを調整できます。可変フォントの太さは任意の数値を直接入力でき、右側の矢印やキーボードの ↑↓ で 10 ずつ、Shift + ↑↓ で 100 ずつ調整できます。静的な Google Fonts は 100 刻みで調整し、存在しないウェイトは飛ばします。矢印はホバー時やフォーカス時に表示され、タッチ画面では常に表示されます。表示が切り替わっても数値の位置は変わりません。連続モードならページで任意の `font-weight` を使えます。各行の空白部分をクリックすると、そのウェイトをプレビューできます。書き出しのチェックは変わりません。段階モードでフォントや追従先を変更すると、各行の実際の対応に基づき、範囲外の書き出しウェイトのチェックを外します。有効な対応や不明な範囲は維持し、取り消しや再選択ができます。 クラス見出し横のリセットで、そのクラスの基本サイズ・ベースライン・調整可能なウェイトを戻し、ウェイト別の個別調整を消去します。ベースフォントの選択とほかのクラスは維持し、取り消しもできます。
- **自動調整。** 独立して選んだ欧文・数字・かな・約物・記号・注音のフォントを文字クラスごとに調整します。欧文は漢字フォント、独立した数字は調整後の欧文、CJK のクラスは漢字フォント内の対応文字を参照します。追従項目は継承し、対応する単一クラスの例外文字も元のクラスに合わせます。参照不足や複数クラスの例外は設定を維持して通知します。両モードでサイズとベースラインを調整し、段階モードではより近いウェイトも選びます。微調整でき、操作全体を一度で取り消せます。通知は画面下からスライドして現れ、しばらく表示してから消えます。視差効果の低減が有効な場合は動かさず表示します。 古いブラウザーでもウェイトを自動調整できます。指定したほかの可変軸を測定できない場合、そのクラスの設定を維持して通知します。
- **3 種類の書き出し。** そのまま貼れる CSS（漢字フォントを Google Fonts から読み込めば通常数 KB）、ブラウザ内で生成する TTF / OTF / WOFF2（Figma、Keynote、Word など向け）、そして試験的に、同じ規則をネイティブアプリで使うための Swift / Kotlin / Flutter のコード。
- **どのフォントでも。** Google Fonts、ローカルフォント、アップロードしたファイルに対応し、収録範囲の確認と、校正刷りでの欠け字の表示があります。フォント名の下に「連続ウェイト」「段階ウェイト」と、既知の範囲や固定ウェイトを表示します。
- **地域ごとの正しさ。** 簡体字・台湾・香港・日本語の字形と約物の位置を確認し、CSS を言語で限定したり、`text-autospace` や `line-break` などの CJK 組版プロパティも書き出したりできます。

## 简体中文

**复合字体工坊**像 InDesign 的复合字体一样，为汉字、假名、标点、西文、数字分别指定字体、大小和基线，按字重微调，实时校样，然后导出：网页用的 CSS，或者给不支持复合字体的软件用的字体文件。

- **按字符类别设定。** 汉字、假名、西文、数字、标点、符号、中西共用标点、注音各自指定字体、大小和基线，还能添加例外字符。大小和基线可直接输入，也可用上下箭头每次微调 0.5。
- **照顾到每个字重。** 在 400 设定的内容会推算到所有字重，「各字重」一览表里可以按字重调整大小和粗细。可变字体的粗细可直接输入任意数值，右侧箭头或键盘 ↑↓ 每次增减 10，Shift + ↑↓ 每次增减 100；静态 Google Fonts 字体按 100 档调整，缺档时跳到下一个可用字重。箭头在悬停或聚焦时出现，触屏上常显；显示与隐藏不会改变数字的对齐位置。连续模式下页面可以用任意 `font-weight`。点击任一行的空白处即可预览该字重，不会改变导出勾选。分档模式换字体或改变跟随关系时，会按各行实际映射自动取消越界的导出字重；有效映射和未知范围保留，可撤销或重新勾选。 类别标题旁的重置按钮恢复该类别的基础大小、基线和可调字重，并清除逐档调整，保留基础字体选择与其他类别，可撤销。
- **自动调整。** 按类别匹配独立指定的西文、数字、假名、标点、符号与注音字体。西文参照汉字字体；独立数字参照本次调整后的西文；CJK 类别参照汉字字体中的对应字符。跟随项继承，符合条件的单一类别例外组参照原类别。缺少可靠参照、混合类别的例外组保持原设置并提示。两种模式都调整大小与基础基线，分档模式还可选择更接近的可用字重。结果可微调，整次操作可一次撤销。操作提示从屏幕底部滑入，停留后淡出；系统开启「减少动态效果」时直接显示。 旧版浏览器仍可自动匹配字重；若无法测量所选的其他可变轴，该类别保留原设置并提示。
- **三种导出。** 可以直接粘贴的 CSS（汉字字体从 Google Fonts 引用时通常只有几 KB）；在浏览器里生成的 TTF / OTF / WOFF2 字体文件，给 Figma、Keynote、Word 等软件用；以及实验性的 Swift / Kotlin / Flutter 代码，在原生 App 里按同样的规则排字。
- **什么字体都能用。** Google Fonts、本机字体、上传的字体文件都可以，会检查字符覆盖范围，并在校样里标出缺字。字体名下用「连续字重」「分档字重」标注已知范围或固定档位。
- **照顾地区差异。** 检查简体、台湾、香港、日文的字形和标点位置，可以把 CSS 限定在某个语言，也会导出 `text-autospace`、`line-break` 等 CJK 排版属性。

## 繁體中文

**複合字型工坊**像 InDesign 的複合字型一樣，為漢字、假名、標點、西文、數字分別指定字型、大小與基線，按字重微調，即時校樣，再匯出成網頁用的 CSS，或給不支援複合字型的軟體使用的字型檔案。

- **依字元類別設定。** 漢字、假名、西文、數字、標點、符號、中西共用標點、注音各自指定字型、大小與基線，也能加入例外字元。大小與基線可直接輸入，也可使用上下箭頭每次微調 0.5。
- **照顧每個字重。** 在 400 設定的內容會推算到所有字重，「各字重」表格裡可以按字重調整大小與粗細。可變字型的粗細可直接輸入任意數值，右側箭頭或鍵盤 ↑↓ 每次增減 10，Shift + ↑↓ 每次增減 100；靜態 Google Fonts 字型按 100 檔調整，缺檔時跳到下一個可用字重。箭頭在滑鼠停留或聚焦時出現，觸控螢幕上持續顯示；顯示與隱藏不會改變數字的對齊位置。連續模式下網頁可以使用任意 `font-weight`。點選任一列的空白處即可預覽該字重，不會改變匯出勾選。分檔模式更換字型或改變跟隨關係時，會依各列實際對應自動取消超出範圍的匯出字重；有效對應與未知範圍保留，可復原或重新勾選。 類別標題旁的重設按鈕會恢復該類別的基礎大小、基線與可調字重，並清除各字重的個別調整，保留基礎字型選擇與其他類別，並可復原。
- **自動調整。** 依類別調整獨立指定的西文、數字、假名、標點、符號與注音字型。西文參照漢字字型；獨立數字參照本次調整後的西文；CJK 類別參照漢字字型中的對應字元。跟隨項目繼承，符合條件的單一類別例外群組參照原類別。缺少可靠參照、混合類別的例外群組保留原設定並提示。兩種模式都調整大小與基礎基線，分段模式也可選擇較接近的可用字重。結果可微調，整次操作可一次復原。操作提示從螢幕底部滑入，停留後淡出；系統開啟「減少動態效果」時直接顯示。 舊版瀏覽器仍可自動比對字重；若無法測量所選的其他可變軸，該類別保留原設定並提示。
- **三種匯出。** 可直接貼上的 CSS（漢字字型從 Google Fonts 引用時通常只有幾 KB）；在瀏覽器裡產生的 TTF / OTF / WOFF2 字型檔案，供 Figma、Keynote、Word 等軟體使用；以及實驗性的 Swift / Kotlin / Flutter 程式碼，在原生 App 裡依相同規則排字。
- **各種字型都能用。** 支援 Google Fonts、本機字型與上傳的字型檔案，會檢查字元涵蓋範圍，並在校樣中標示缺字。字型名下使用「連續字重」「分段字重」標示已知範圍或固定檔位。
- **照顧地區差異。** 檢查簡體、臺灣、香港、日文的字形與標點位置，可以將 CSS 限定為特定語言，也會匯出 `text-autospace`、`line-break` 等 CJK 排版屬性。

## License

[MIT](LICENSE)
