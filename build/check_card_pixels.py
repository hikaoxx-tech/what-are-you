# -*- coding: utf-8 -*-
"""分享卡片像素级验收（Playwright + PIL）

背景：html2canvas 1.4.1 对 flex / vertical-align 渲染不准，导致：
  a) 动物图标不在圆圈内（vertical-align: middle 失效）
  b) 「非正式」印章文字被挤到左上角、显示不全（flex 居中失效）
本脚本用确定性场景（完整 30 题全选 A → ESTJ 牧羊犬，橙棕色图标便于检测）
对生成 PNG 做像素断言，并验证微信内「关闭」按钮居中（DOM 断言）。

用法：先起本地服务（python -m http.server 8765），再运行本脚本。
"""
import base64
import io
import json
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8765/'
OUT_PNG = 'build/card_check_full.png'
results = []


def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS' if ok else 'FAIL'), '-', name, detail if not ok else '')


def analyze(png_bytes):
    """像素断言（PNG 为 750x1000 的 2 倍缩放 → 1500x2000）"""
    img = Image.open(io.BytesIO(png_bytes)).convert('RGB')
    px = img.load()
    W, H = img.size
    check('PNG 尺寸 1500x2000', (W, H) == (1500, 2000), f'{W}x{H}')

    # 坐标（scale=2）：卡片 x 56..1444, y 56..1944；hero y 56..800
    # 圆圈：中心 (750,312) 半径 140；印章圆：中心 (1316,184) 半径 76
    # 1) 动物图标（牧羊犬橙棕色系）：R>140, 40<G<220, B<140, R>G
    icon_pts = [(x, y) for y in range(116, 508) for x in range(560, 940)
                if (lambda c: c[0] > 140 and 40 < c[1] < 220 and c[2] < 140 and c[0] > c[1])(px[x, y])]
    check('图标像素存在(>200)', len(icon_pts) > 200, f'n={len(icon_pts)}')
    if icon_pts:
        xs = [p[0] for p in icon_pts]
        ys = [p[1] for p in icon_pts]
        cx = (min(xs) + max(xs)) / 2
        cy = (min(ys) + max(ys)) / 2
        dist = ((cx - 750) ** 2 + (cy - 312) ** 2) ** 0.5
        check('图标中心与圆圈中心偏差<12px', dist < 12, f'icon=({cx:.0f},{cy:.0f}) dist={dist:.1f}')

    # 2) 印章「非正式」：红 #E8716A 整体 opacity .85，混合后 ≈(204,103,105)（b≈g，不能用 r>g>b）
    ring_pts = [(x, y) for y in range(108, 261) for x in range(1240, 1393)
                if (lambda c: c[0] > 170 and c[1] < 170 and c[2] < 170 and c[0] - c[1] > 90 and abs(c[1] - c[2]) < 35)(px[x, y])]
    check('印章红色像素存在(>500)', len(ring_pts) > 500, f'n={len(ring_pts)}')
    if ring_pts:
        com_x = sum(p[0] for p in ring_pts) / len(ring_pts)
        com_y = sum(p[1] for p in ring_pts) / len(ring_pts)
        dist = ((com_x - 1316) ** 2 + (com_y - 184) ** 2) ** 0.5
        check('印章红像素质心居中(偏差<18px)', dist < 18, f'com=({com_x:.0f},{com_y:.0f}) dist={dist:.1f}')

        # 文字像素：距圆心 < 55（排除外圈描边；内圈虚描边混合色 r≈146 不满足掩码）
        text_pts = [p for p in ring_pts if (p[0] - 1316) ** 2 + (p[1] - 184) ** 2 < 55 ** 2]
        check('印章文字像素存在(>80)', len(text_pts) > 80, f'n={len(text_pts)}')
        if text_pts:
            xs = [p[0] for p in text_pts]
            ys = [p[1] for p in text_pts]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            tcx = (min_x + max_x) / 2
            tcy = (min_y + max_y) / 2
            check('文字横向居中(|cx-1316|<22)', abs(tcx - 1316) < 22, f'cx={tcx:.0f}')
            check('文字纵向居中(|cy-184|<16)', abs(tcy - 184) < 16, f'cy={tcy:.0f}')
            # 文字若被挤到左上角，min_y 会贴住圆顶(≈114)；居中时 ≈164
            check('文字未被裁切(min_y>140)', min_y > 140, f'min_y={min_y} min_x={min_x}')
    return img


def run_pixel_scenario(browser):
    """完整 30 题全选 A → ESTJ 牧羊犬 → 生成卡片 → 像素断言"""
    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(1000)
    page.click('#btn-start')
    for i in range(30):
        page.wait_for_selector('#q-options .option', state='visible')
        page.locator('#q-options .option').first.click()  # 全选 A
        page.wait_for_timeout(330)
    page.wait_for_selector('#page-result:not(.hidden)', state='visible')
    name = page.eval_on_selector('#r-name', 'el => el.textContent')
    check('全A结果为 ESTJ', name.strip() == '听我的', repr(name.strip()))
    page.click('#btn-capture')
    page.wait_for_selector('#overlay:not(.hidden)', state='visible', timeout=30000)
    src = page.eval_on_selector('#captured-img', 'el => el.src')
    check('PNG 已生成', src.startswith('data:image/png'))
    png = base64.b64decode(src.split(',')[1])
    with open('build/card_check_full.png', 'wb') as f:
        f.write(png)
    analyze(png)
    check('console 无错误', len(errors) == 0, json.dumps(errors[:3]))
    ctx.close()


WECHAT_UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) '
             'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 '
             'MicroMessenger/8.0.49(0x18003123) NetType/WIFI Language/zh_CN')


def run_overlay_scenarios(browser):
    """遮罩按钮：微信 UA → 「关闭」单按钮居中；普通 UA → 双按钮并排"""
    for label, ua, is_wechat in [('微信UA', WECHAT_UA, True),
                                 ('普通浏览器', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', False)]:
        ctx = browser.new_context(user_agent=ua, viewport={'width': 390, 'height': 844})
        page = ctx.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(BASE, wait_until='domcontentloaded')
        page.wait_for_timeout(800)
        page.click('#btn-start-quick')
        for i in range(12):
            page.wait_for_selector('#q-options .option', state='visible')
            page.locator('#q-options .option').first.click()
            page.wait_for_timeout(360)
        page.wait_for_selector('#page-result:not(.hidden)', state='visible')
        page.click('#btn-capture')
        page.wait_for_selector('#overlay:not(.hidden)', state='visible', timeout=30000)
        single = page.eval_on_selector('#overlay-actions', 'el => el.classList.contains("single")')
        check(label + ' single 类状态正确', single == is_wechat, f'single={single}')
        box = page.locator('#btn-close').bounding_box()
        if is_wechat:
            # 单按钮：宽度适中（非通栏），水平居中于视口
            cx = box['x'] + box['width'] / 2
            check(label + ' 关闭按钮宽度适中(<300px)', box['width'] < 300, f'w={box["width"]:.0f}')
            check(label + ' 关闭按钮水平居中(视口中心±6px)', abs(cx - 195) < 6, f'cx={cx:.1f} hw={box["width"]:.0f}')
        else:
            # 双按钮：关闭在右侧、与保存并排
            dl = page.locator('#btn-download').bounding_box()
            check(label + ' 双按钮并排(关闭在保存右侧)', box['x'] > dl['x'] + dl['width'] / 2, f'close.x={box["x"]:.0f} dl.right={dl["x"]+dl["width"]:.0f}')
        page.click('#btn-close')
        check(label + ' 关闭遮罩', page.locator('#overlay').is_hidden())
        check(label + ' console 无错误', len(errors) == 0, json.dumps(errors[:3]))
        ctx.close()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    run_pixel_scenario(browser)
    run_overlay_scenarios(browser)
    fails = [r for r in results if not r[1]]
    print('=' * 40)
    print('TOTAL:', len(results), ' PASS:', len(results) - len(fails), ' FAIL:', len(fails))
    sys.exit(1 if fails else 0)
