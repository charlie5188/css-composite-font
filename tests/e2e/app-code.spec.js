// App code export: compare generated range tables with web classification. When a toolchain is installed, compile the output and compare an actual text split with the web result.
// Swift: swiftc on macOS (the AppKit branch).
// Kotlin: kotlinc plus an Android API jar (Robolectric android-all, see AGENTS.md); run classOf on the JVM.
//   Dart：flutter（flutter analyze + flutter test）
// Skip unavailable toolchains; CI checks only the range table.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { open, pick } = require('./helpers');

// Characters from every category, exceptions, CJK extensions, and emoji.
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
    // Add an exception and a baseline offset to cover exception precedence and shifts.
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

    // Web splitting: merge adjacent characters in the same category and serialize as category:characterCount,...
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
      // Compile against Android APIs with warnings treated as errors. classOf is pure computation and can run directly on the JVM.
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
      // Minimal Flutter package: analyze must report nothing; the test splits text and creates a TextSpan.
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
