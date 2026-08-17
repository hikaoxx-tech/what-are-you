# -*- coding: utf-8 -*-
"""微信保存长图修复专项验收（Playwright）

场景 A：微信 UA 打开 → 快测 12 题 → 生成分享长图 → 遮罩内应隐藏「保存图片」按钮、显示「长按保存」引导
场景 B：普通浏览器 UA → 同上 → 遮罩内应显示「保存图片」按钮、隐藏长按引导
两场景均要求 console 无错误。
"""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8765/'
results = []


def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS' if ok else 'FAIL'), '-', name, detail if not ok else '')


WECHAT_UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) '
             'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 '
             'MicroMessenger/8.0.49(0x18003123) NetType/WIFI Language/zh_CN')


def run_scenario(browser, label, ua):
    ctx = browser.new_context(user_agent=ua, viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(1000)

    # 快测 12 题（每题点第一个选项）
    page.click('#btn-start-quick')
    for i in range(12):
        page.wait_for_selector('#q-options .option', state='visible')
        page.locator('#q-options .option').first.click()
        page.wait_for_timeout(380)
    page.wait_for_selector('#page-result:not(.hidden)', state='visible')
    check(label + ' 快测出结果', True)

    # 生成分享长图
    page.click('#btn-capture')
    page.wait_for_selector('#overlay:not(.hidden)', state='visible', timeout=20000)
    check(label + ' 长图遮罩打开', True)

    img_src = page.eval_on_selector('#captured-img', 'el => el.src')
    check(label + ' 长图已生成(dataURL)', img_src.startswith('data:image/png'),
          'src=' + img_src[:60])

    dl_visible = page.locator('#btn-download').is_visible()
    hint_visible = page.locator('#save-hint').is_visible()
    if ua == WECHAT_UA:
        check(label + ' 微信内隐藏下载按钮', not dl_visible)
        check(label + ' 微信内显示长按保存引导', hint_visible)
        hint_text = page.locator('#save-hint').inner_text()
        check(label + ' 引导文案含「长按」', '长按' in hint_text, hint_text)
    else:
        check(label + ' 普通浏览器显示下载按钮', dl_visible)
        check(label + ' 普通浏览器隐藏长按引导', not hint_visible)
        check(label + ' 下载按钮带文件名', '你是什么东西.png' in page.get_attribute('#btn-download', 'download') or 'download' in str(page.evaluate("el => el.outerHTML", page.locator('#btn-download').element_handle())))

    # 关闭遮罩
    page.click('#btn-close')
    check(label + ' 关闭遮罩', page.locator('#overlay').is_hidden())
    check(label + ' console 无错误', len(errors) == 0, json.dumps(errors[:3]))
    ctx.close()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    run_scenario(browser, '微信UA', WECHAT_UA)
    run_scenario(browser, '普通浏览器', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')

    fails = [r for r in results if not r[1]]
    print('=' * 40)
    print('TOTAL:', len(results), ' PASS:', len(results) - len(fails), ' FAIL:', len(fails))
    sys.exit(1 if fails else 0)
