# -*- coding: utf-8 -*-
"""四档程度制专项验收（Playwright + 本地静态服务器 8765）

覆盖：
A. 答题页渲染：普通题 4 个完整按钮（程度标签 + v4 倾向句）、彩蛋题 2 个按钮
B. tiebreaker 方案 1（完整版）：EI 维 3 完全A(-3) + 2 完全B(+2) + 2 偏B(+1) = 0，
   完全档 3A > 2B → 判 A → E；其余维全完全A → 预期 ESTJ
C. tiebreaker 方案 1（快测版）：EI 维 1 完全A(-1) + 2 偏B(+1) = 0 → 完全档 1A > 0B → E
D. 四档计分：全完全A（每维 -7）→ ESTJ；全完全B（每维 +7）→ INFP
E. 快测 + 补测累加：快测 EI 得 -1.5 分，补测 EI 4 题得 +2.5 分 → 总分 +1 → I
"""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8765/'
results = []


def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS' if ok else 'FAIL'), '-', name, detail if not ok else '')


def answer(page, seq):
    """seq = 每题的按钮下标序列（0=完全A 1=偏A 2=偏B 3=完全B）；
    彩蛋题只有 2 个按钮，自动收窄到最后一个可点按钮"""
    for idx in seq:
        page.wait_for_selector('#q-options .option', state='visible')
        n = page.locator('#q-options .option').count()
        page.locator('#q-options .option').nth(min(idx, n - 1)).click()
        page.wait_for_timeout(360)


def result_name(page):
    page.wait_for_selector('#page-result:not(.hidden)', state='visible', timeout=8000)
    return page.locator('#r-name').inner_text(), page.locator('#r-animal').inner_text()


def is_type(name, animal, expect_name, expect_animal):
    return name == expect_name and ('官方认证动物：' + expect_animal) in animal


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(1000)

    # ---------- A. 渲染：普通题 4 按钮 / 彩蛋题 2 按钮 ----------
    page.click('#btn-start')
    page.wait_for_selector('#q-options .option', state='visible')
    n4 = page.locator('#q-options .option').count()
    check('普通题渲染 4 个按钮', n4 == 4, 'count=' + str(n4))
    labels = page.locator('#q-options .option .deg-label').all_inner_texts()
    check('程度标签为 ①②③④ 完整档', labels == ['① 完全是我', '② 有点像我', '③ 有点像我', '④ 完全是我'], str(labels))
    first_text = page.locator('#q-options .option').first.locator('.deg-text').inner_text()
    check('按钮含 v4 完整句子', '认识新朋友对我来说是放松不是消耗' in first_text, first_text[:30])
    hint = page.locator('.q-hint').inner_text()
    check('出现犹豫引导语', '按直觉来' in hint, hint[:30])
    # 跳到 Q15 彩蛋题：答 14 题（Q1-Q14）
    answer(page, [0] * 14)
    n2 = page.locator('#q-options .option').count()
    check('彩蛋题渲染 2 个按钮', n2 == 2, 'count=' + str(n2))
    egg = page.locator('#q-options .option').all_inner_texts()
    check('彩蛋题二选一文案', egg == ['谢谢，我继续', '我才发现已经一半了？'], str(egg))
    page.reload(wait_until='domcontentloaded')
    page.wait_for_timeout(800)

    # ---------- B. tiebreaker（完整版）：EI = 3A完全 + 2B完全 + 2B偏 = 0 → E ----------
    ctx.clear_cookies()
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(800)
    page.evaluate('localStorage.clear()')
    page.click('#btn-start')
    # 30 题下标（0-based）：EI = 0,4,8,12,17,21,25（第 1,5,9,13,18,22,26 题）
    # 答：EI 题 → [0A, 0A, 0A, 3B, 3B, 2B, 2B]；其余题 → 0（完全A）
    seq = []
    for i in range(30):
        if i in (0, 4, 8):        seq.append(0)   # 完全A ×3
        elif i in (12, 17):       seq.append(3)   # 完全B ×2
        elif i in (21, 25):       seq.append(2)   # 偏B   ×2
        else:                     seq.append(0)   # 其余维全完全A
    answer(page, seq)
    name, animal = result_name(page)
    check('tiebreaker(完整) EI 0分判A → ESTJ', is_type(name, animal, '听我的', '牧羊犬'), name + '·' + animal)
    rarity = page.locator('#r-rarity').inner_text()
    check('稀有度徽章出现', '稀有' in rarity, rarity)

    # ---------- C. tiebreaker（快测版）：EI = 1完全A + 2偏B = 0 → E ----------
    page.evaluate('localStorage.clear()')
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(800)
    page.click('#btn-start-quick')
    # 快测 12 题顺序：EI(0,12,25) SN(1,13,26) TF(2,15,27) JP(3,16,28)
    seq = []
    for i in range(12):
        if i in (0,):      seq.append(0)   # Q1 完全A
        elif i in (1, 2):  seq.append(2)   # Q13/Q26 偏B（EI 第 2/3 题）
        else:              seq.append(0)   # 其余全完全A
    answer(page, seq)
    name, animal = result_name(page)
    check('tiebreaker(快测) EI 0分判A → ESTJ', is_type(name, animal, '听我的', '牧羊犬'), name + '·' + animal)

    # ---------- D1. 全完全A → ESTJ ----------
    page.evaluate('localStorage.clear()')
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(800)
    page.click('#btn-start')
    answer(page, [0] * 30)
    name, animal = result_name(page)
    check('全完全A → ESTJ', is_type(name, animal, '听我的', '牧羊犬'), name + '·' + animal)

    # ---------- D2. 全完全B → INFP ----------
    page.evaluate('localStorage.clear()')
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(800)
    page.click('#btn-start')
    answer(page, [3] * 30)
    name, animal = result_name(page)
    check('全完全B → INFP', is_type(name, animal, '我想开了', '水母'), name + '·' + animal)

    # ---------- E. 快测 + 补测累加：EI 快测 -1.5（1A完全+2A偏= -1-0.5-0.5? 构造见下） ----------
    # 快测 EI 三题：完全A(-1) + 偏A(-0.5) + 偏A(-0.5) = -2；补测 EI 四题(Q5,Q9,Q18,Q22)：
    # 完全B(+1) + 完全B(+1) + 偏B(+0.5) + 偏B(+0.5) = +3 → EI 总分 +1 → I
    page.evaluate('localStorage.clear()')
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(800)
    page.click('#btn-start-quick')
    seq = []
    for i in range(12):
        if i in (0, 1, 2): seq.append(0) if i == 0 else seq.append(1)  # EI: 完全A, 偏A, 偏A
        else:              seq.append(0)
    answer(page, seq)
    page.wait_for_selector('#btn-upgrade', state='visible', timeout=8000)
    page.click('#btn-upgrade')
    # 补测 18 题顺序（过滤快测题）：4,5,6,7,8,9,10,11,14,17,18,19,20,21,22,23,24,29
    # 补测中 EI 题 = 4(Q5), 8(Q9), 17(Q18), 21(Q22)，位于补测序列第 0,4,9,13 位
    seq = []
    for i in range(18):
        if i in (0, 4, 9, 13): seq.append(3)   # 完全B
        else:                  seq.append(0)   # 其余维完全A
    answer(page, seq)
    name, animal = result_name(page)
    # 各维总分：EI = -2 + 3 = +1 → I；SN/TF/JP = -7 + 0 = -7 → S/T/J → ISTJ
    check('快测+补测累加 EI +1 → ISTJ', is_type(name, animal, '你超纲了', '猫头鹰'), name + '·' + animal)

    check('专项场景 console 无错误', len(errors) == 0, json.dumps(errors[:3]))

    browser.close()

fails = [r for r in results if not r[1]]
print('\n===== 四档专项: %d/%d 通过 =====' % (len(results) - len(fails), len(results)))
sys.exit(1 if fails else 0)
