// App 代码导出：生成的范围表和网页的类别判断一致；有 Swift 编译器的 macOS 上，再编译生成的 Swift、实际切一次文字
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { open, pick } = require('./helpers');

// 各类别的字、例外字符、中日韩扩展区、emoji
const SAMPLE = '永国字體あアㄅ，。「」《》①※→“‘—…·AaGg01é 한😀𠀀';
const hasSwift = (() => { try { return process.platform === 'darwin' && !!execFileSync('swiftc', ['--version'], { stdio: 'pipe' }); } catch (e) { return false; } })();

for (const id of ['serif-sc', 'gothic-jp', 'antigochi', 'mac']) {
  test(`App 代码：${id} 的范围表和网页一致`, async ({ page }) => {
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
      return { want, got, swift: app.buildSwift(m), name: m.name, classes: m.classes, ranges: m.ranges.length, shift: m.shift };
    }, SAMPLE);
    expect(r.got).toEqual(r.want);
    expect(r.shift[r.shift.length - 1]).toBeCloseTo(0.05);
    if (!hasSwift) return;
    // macOS：编译生成的 Swift（AppKit 那一支），切一次样本文字，和网页的切分比较
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-swift-'));
    fs.writeFileSync(path.join(dir, 'Composite.swift'), r.swift);
    fs.writeFileSync(path.join(dir, 'main.swift'), `import Foundation
let s = CommandLine.arguments[1]
print(${r.name}.runs(s).map { "\\($0.cls):\\($0.text.unicodeScalars.count)" }.joined(separator: ","))
print(${r.name}.attributed(s, size: 20, weight: 700).length > 0)
`);
    execFileSync('swiftc', ['-O', '-o', path.join(dir, 'run'), path.join(dir, 'Composite.swift'), path.join(dir, 'main.swift')], { stdio: 'pipe' });
    const out = execFileSync(path.join(dir, 'run'), [SAMPLE], { encoding: 'utf8' }).trim().split('\n');
    const runs = [];      // 网页的切分：相邻同类别的字合成一段
    for (const c of r.got) { const i = c === 'han' ? 0 : c[0] === '#' ? r.classes.length - 1 : r.classes.indexOf(c); const l = runs[runs.length - 1]; if (l && l[0] === i) l[1]++; else runs.push([i, 1]); }
    expect(out[0]).toBe(runs.map(([i, n]) => `${i}:${n}`).join(','));
    expect(out[1]).toBe('true');
  });
}
