# -*- coding: utf-8 -*-
"""视觉检查：封面 / 答题页 / 快测结果页 / 完整结果页 截图"""
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8765/'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(BASE, wait_until='domcontentloaded')
    page.wait_for_timeout(2500)
    page.screenshot(path='build/shot-cover.png', full_page=False)

    # 答题页（快测）
    page.click('#btn-start-quick')
    page.wait_for_timeout(1200)
    page.screenshot(path='build/shot-quiz.png', full_page=False)

    # 快测答完 → 结果页（等盖章动画结束）
    for _ in range(12):
        page.locator('#q-options .option').first.click()
        page.wait_for_timeout(430)
    page.wait_for_selector('#result-card', state='visible', timeout=6000)
    page.wait_for_timeout(2000)
    page.screenshot(path='build/shot-result-quick.png', full_page=False)

    # 完整结果页（升级后）
    page.click('#btn-upgrade')
    page.wait_for_timeout(800)
    for _ in range(18):
        page.locator('#q-options .option').first.click()
        page.wait_for_timeout(430)
    page.wait_for_selector('#result-card', state='visible', timeout=6000)
    page.wait_for_timeout(2000)
    page.screenshot(path='build/shot-result-full.png', full_page=False)

    browser.close()
    print('screenshots saved')
