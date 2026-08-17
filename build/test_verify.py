# -*- coding: utf-8 -*-
"""《你是什么东西》交互验收脚本（Playwright + 本地静态服务器）

覆盖：封面快测入口 / 字体加载 / 断点续答 / 快测 12 题 → 升级补测 18 题 →
完整结果（稀有度徽章出现）/ 盖章动画 / console 无错误。

用法（由 with_server.py 拉起服务器后执行）：
    python scripts/with_server.py --server "python -m http.server 8765" \
        --port 8765 -- python build/test_verify.py
"""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8765/'
results = []


def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS' if ok else 'FAIL'), '-', name, detail if not ok else '')


def answer_questions(page, n, wait_ms=430):
    """连续答 n 题（每题点第一个选项）"""
    for _ in range(n):
        page.wait_for_selector('#q-options .option', state='visible')
        page.locator('#q-options .option').first.click()
        page.wait_for_timeout(wait_ms)


def new_page(browser, with_storage_state=None):
    ctx = browser.new_context(storage_state=with_storage_state)
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(1200)
    return ctx, page, errors


def state_of(ctx):
    return ctx.storage_state(path='')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # ---------- 场景 1：首页 + 字体 ----------
    ctx, page, errors = new_page(browser)
    page.wait_for_selector('#btn-start-quick', state='visible')
    check('封面出现快测入口', True)
    check('封面出现继续按钮(无进度时隐藏)',
          page.locator('#btn-resume').is_hidden())
    fonts_ok = page.evaluate("""
        document.fonts.ready.then(function () {
          return document.fonts.check('700 40px WADisplay');
        })
    """)
    check('WADisplay 字体已加载', fonts_ok,
          '字体未加载（可能子集/路径问题）' if not fonts_ok else '')

    # ---------- 场景 2：断点续答 ----------
    page.click('#btn-start')
    page.wait_for_selector('#q-options .option', state='visible')
    check('完整版答题页（第 1/30 题）',
          page.locator('#q-count').inner_text() == '第 1 / 30 题')
    answer_questions(page, 2)
    page.goto(BASE, wait_until='domcontentloaded')  # 同 context 刷新：localStorage 进度保留
    page.wait_for_selector('#btn-resume', state='visible')
    label = page.locator('#btn-resume').inner_text()
    check('封面出现"继续上次测试"', '继续' in label, label)
    check('续答文案题号正确', '第 3 / 30 题' in label, label)
    page.click('#btn-resume')
    page.wait_for_selector('#q-options .option', state='visible')
    check('恢复后从第 3 题继续', page.locator('#q-count').inner_text() == '第 3 / 30 题')
    check('场景2无 console 错误', len(errors) == 0, json.dumps(errors[:3]))

    # ---------- 场景 3：快测 → 升级 → 完整档案 ----------
    ctx3, page3, errors3 = new_page(browser)
    page3.click('#btn-start-quick')
    page3.wait_for_selector('#q-options .option', state='visible')
    check('快测模式标签', page3.locator('#q-mode').inner_text() == '快测')
    check('快测答题页（第 1/12 题）',
          page3.locator('#q-count').inner_text() == '第 1 / 12 题')
    answer_questions(page3, 12)
    page3.wait_for_selector('#btn-upgrade', state='visible', timeout=6000)
    check('快测结果页出现升级按钮', page3.locator('#btn-upgrade').is_visible())
    check('快测结果页出现快测注记', page3.locator('#r-quick-note').is_visible())
    check('快测结果页隐藏稀有度徽章', page3.locator('#r-rarity').is_hidden())
    check('结果页盖章动画已触发',
          'stamp-strike' in (page3.locator('#result-card .stamp').get_attribute('class') or ''))

    # 中途退出 → 回来显示"继续升级完整档案"
    page3.goto(BASE, wait_until='domcontentloaded')  # 同 context 刷新：快测进度保留
    page3.wait_for_selector('#btn-resume', state='visible')
    lbl = page3.locator('#btn-resume').inner_text()
    check('快测完成后回访显示"继续升级"', '继续升级完整档案' in lbl, lbl)

    page3.click('#btn-resume')  # 恢复：进入补测阶段
    page3.wait_for_selector('#q-options .option', state='visible')
    check('补测模式标签', page3.locator('#q-mode').inner_text() == '补测')
    check('补测答题页（第 1/18 题）',
          page3.locator('#q-count').inner_text() == '第 1 / 18 题')
    answer_questions(page3, 18)
    page3.wait_for_selector('#result-card', state='visible', timeout=6000)
    page3.wait_for_timeout(600)
    check('升级完成后稀有度徽章出现', page3.locator('#r-rarity').is_visible())
    check('升级完成后快测注记消失', page3.locator('#r-quick-note').is_hidden())
    check('场景3无 console 错误', len(errors3) == 0, json.dumps(errors3[:3]))

    browser.close()

fails = [r for r in results if not r[1]]
print('\n===== 结果: %d/%d 通过 =====' % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)
