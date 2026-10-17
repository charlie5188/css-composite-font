// App 代码导出：生成的范围表和网页的类别判断一致；装了对应工具链时，再编译生成的代码、实际切一次文字，和网页的切分比较
//   Swift：macOS 上的 swiftc（AppKit 那一支）
//   Kotlin：kotlinc + Android API 的 jar（Robolectric 的 android-all，见 AGENTS.md），在 JVM 上跑 classOf
//   Dart：flutter（flutter analyze + flutter test）
// 没装的就跳过那一种，CI 上只跑范围表的检查
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { open, pick } = require('./helpers');

// 各类别的字、例外字符、中日韩扩展区、emoji
const SAMPLE = '永国字體あアㄅ，。「」《》①※→“‘—…·AaGg01é 한😀𠀀';
const has = (cmd, args) => { try { execFileSync(cmd, args, { stdio: 'pipe' }); return true; } catch (e) { return false; } };
const hasSwift = process.platform === 'darwin' && has('swiftc', ['--version']);
const ANDROID_JAR = process.env.CF_ANDROID_JAR || path.join(os.homedir(), '.cache/cf-android/android-all-14.jar');
const hasKotlin = fs.existsSync(ANDROID_JAR) && has('kotlinc', ['-version']);
const hasFlutter = has('flutter', ['--version']);
const tmp = name => fs.mkdtempSync(path.join(os.tmpdir(), `cf-${name}-`));
const run = (cmd, args, opts = {}) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts }); }
  catch (e) { throw new Error(`${cmd} ${args.join(' ')}\n${e.stdout || ''}${e.stderr || ''}`); }
};

for (const id of ['serif-sc', 'gothic-jp', 'antigochi', 'mac']) {
  test(`App 代码：${id} 的范围表和网页一致`, async ({ page }) => {
    test.setTimeout(300_000);
    await open(page);
    await pick(page, id);
    await page.waitForTimeout(300);
    // 加一个例外字符和一个基线偏移，覆盖「例外盖在类别上」和 shift
    const r = await page.evaluate(async sample => {
      const core = await import('./assets/js/core.js'), app = await import('./assets/js/appcode.js');
      core.state.custom.push({ chars: '·A', follow: 'han', font: null, size: 90, shift: 5 });
      core.refreshCustomRanges();
      const m = app.appModel();
      const want = [...sample].map(ch => { const o = core.ownerOf(ch.codePointAt(0)); return o === 'other' ? 'han' : o; });
      const got = [...sample].map(ch => { const i = app.classOfModel(m, ch.codePointAt(0)); return i === 0 ? 'han' : m.classes[i].startsWith('custom') ? '#' + (core.state.custom.length - 1) : m.classes[i]; });
      return { want, got, swift: app.buildSwift(m), kotlin: app.buildKotlin(m), dart: app.buildDart(m), name: m.name, classes: m.classes, styles: m.styles.length, shift: m.shift };
    }, SAMPLE);
    expect(r.got).toEqual(r.want);
    expect(r.shift[r.shift.length - 1]).toBeCloseTo(0.05);

    // 网页的切分：相邻同类别的字合成一段，写成「类别:字数,…」
    const runs = [];
    for (const c of r.got) { const i = c === 'han' ? 0 : c[0] === '#' ? r.classes.length - 1 : r.classes.indexOf(c); const l = runs[runs.length - 1]; if (l && l[0] === i) l[1]++; else runs.push([i, 1]); }
    const want = runs.map(([i, n]) => `${i}:${n}`).join(',');

    if (hasSwift) {
      const dir = tmp('swift');
      fs.writeFileSync(path.join(dir, 'Composite.swift'), r.swift);
      fs.writeFileSync(path.join(dir, 'main.swift'), `import Foundation
let s = CommandLine.arguments[1]
print(${r.name}.runs(s).map { "\\($0.cls):\\($0.text.unicodeScalars.count)" }.joined(separator: ","))
print(${r.name}.attributed(s, size: 20, weight: 700).length > 0)
`);
      run('swiftc', ['-O', '-o', path.join(dir, 'run'), path.join(dir, 'Composite.swift'), path.join(dir, 'main.swift')]);
      const out = run(path.join(dir, 'run'), [SAMPLE]).trim().split('\n');
      expect(out[0], 'Swift').toBe(want);
      expect(out[1]).toBe('true');
    }

    if (hasKotlin) {
      // 对着 Android API 编译（警告也算错），classOf 是纯计算，可以直接在 JVM 上跑
      const dir = tmp('kotlin');
      fs.writeFileSync(path.join(dir, 'sample.txt'), SAMPLE);
      fs.writeFileSync(path.join(dir, 'Composite.kt'), r.kotlin);
      fs.writeFileSync(path.join(dir, 'Main.kt'), `import com.example.fonts.${r.name}
import java.io.File

fun main(args: Array<String>) {
    val s = File(args[0]).readText(Charsets.UTF_8)
    val out = ArrayList<IntArray>()
    var i = 0
    while (i < s.length) {
        val cp = s.codePointAt(i)
        val c = ${r.name}.classOf(cp)
        if (out.isNotEmpty() && out.last()[0] == c) out.last()[1]++ else out.add(intArrayOf(c, 1))
        i += Character.charCount(cp)
    }
    println(out.joinToString(",") { "\${it[0]}:\${it[1]}" })
}
`);
      run('kotlinc', ['-Werror', '-nowarn', '-cp', ANDROID_JAR, '-d', path.join(dir, 'out'), path.join(dir, 'Composite.kt'), path.join(dir, 'Main.kt')]);
      const out = run('kotlin', ['-cp', [path.join(dir, 'out'), ANDROID_JAR].join(path.delimiter), 'MainKt', path.join(dir, 'sample.txt')]).trim();
      expect(out, 'Kotlin').toBe(want);
    }

    if (hasFlutter) {
      // 一个最小的 Flutter 包：analyze 不能有任何提示，test 里切一次文字、建一次 TextSpan
      const dir = tmp('flutter');
      fs.mkdirSync(path.join(dir, 'lib')); fs.mkdirSync(path.join(dir, 'test'));
      fs.writeFileSync(path.join(dir, 'pubspec.yaml'), `name: cf_check
environment:
  sdk: ">=3.0.0 <4.0.0"
dependencies:
  flutter:
    sdk: flutter
dev_dependencies:
  flutter_test:
    sdk: flutter
`);
      fs.writeFileSync(path.join(dir, 'analysis_options.yaml'), 'analyzer:\n  language:\n    strict-casts: true\n    strict-raw-types: true\n');
      fs.writeFileSync(path.join(dir, 'lib/composite.dart'), r.dart);
      fs.writeFileSync(path.join(dir, 'test/composite_test.dart'), `import 'package:flutter_test/flutter_test.dart';
import 'package:cf_check/composite.dart';

void main() {
  test('runs', () {
    const s = ${JSON.stringify(SAMPLE)};
    final out = <List<int>>[];
    for (final cp in s.runes) {
      final c = ${r.name}.classOf(cp);
      if (out.isNotEmpty && out.last[0] == c) {
        out.last[1]++;
      } else {
        out.add([c, 1]);
      }
    }
    expect(out.map((e) => '\${e[0]}:\${e[1]}').join(','), ${JSON.stringify(want)});
    final span = ${r.name}.span(s, size: 20, weight: 700);
    expect(span.children!.length, out.length);
    expect(span.toPlainText(), s);
  });
}
`);
      try { run('flutter', ['pub', 'get', '--offline'], { cwd: dir }); } catch (e) { run('flutter', ['pub', 'get'], { cwd: dir }); }
      run('flutter', ['analyze', '--no-pub'], { cwd: dir });
      run('flutter', ['test', '--no-pub'], { cwd: dir });
    }
  });
}
