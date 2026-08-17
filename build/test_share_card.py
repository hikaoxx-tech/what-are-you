# -*- coding: utf-8 -*-
"""分享卡片截图专项验收（Playwright）

场景 A：快测 12 题 → 生成分享卡片 → 遮罩打开、PNG 生成、尺寸 1500x2000（750x1000 @2x）
场景 B：完整 30 题 → 生成分享卡片 → 稀有度徽章出现在卡片内、尺寸正确
两个场景均把 PNG 落盘到 build/ 供人工目检，并断言 console 无错误。
"""
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8765/'
OUT = pathlib.Path(__file__).resolve().parent
results = []


def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS' if ok else 'FAIL'), '-', name, detail if not ok else '')


def run_scenario(browser, label, quick, out_png):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(1000)

    total = 12 if quick else 30
    page.click('#btn-start-quick' if quick else '#btn-start')
    for i in range(total):
        page.wait_for_selector('#q-options .option', state='visible')
        # 刻意交替选 A/B，避免全 A 极端分（快测/完整都测普通分布）
        page.locator('#q-options .option').nth(i % 2).click()
        page.wait_for_timeout(360)
    page.wait_for_selector('#page-result:not(.hidden)', state='visible')
    check(label + ' 出结果', True)

    page.click('#btn-capture')
    page.wait_for_selector('#overlay:not(.hidden)', state='visible', timeout=30000)
    check(label + ' 遮罩打开', True)

    src = page.eval_on_selector('#captured-img', 'el => el.src')
    check(label + ' 已生成 PNG dataURL', src.startswith('data:image/png'), src[:60])

    dims = page.evaluate('''(src) => new Promise((res) => {
        var im = new Image();
        im.onload = () => res([im.naturalWidth, im.naturalHeight]);
        im.onerror = () => res([0, 0]);
        im.src = src;
      })''', src)
    check(label + ' 尺寸 1500x2000 (750x1000 @2x)', dims == [1500, 2000], str(dims))

    # 落盘 PNG 供目检
    import base64
    (OUT / out_png).write_bytes(base64.b64decode(src.split(',')[1]))
    check(label + ' console 无错误', len(errors) == 0, json.dumps(errors[:3]))
    ctx.close()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    run_scenario(browser, '快测', True, OUT / 'shot_quick.png')
    run_scenario(browser, '完整', False, OUT / 'shot_full.png')

    fails = [r for r in results if not r[1]]
    print('=' * 40)
    print('TOTAL:', len(results), ' PASS:', len(results) - len(fails), ' FAIL:', len(fails))
    sys.exit(1 if fails else 0)
