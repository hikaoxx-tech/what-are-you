# -*- coding: utf-8 -*-
"""验证线上版本已更新（重试版）"""
import hashlib
import time
import urllib.request

PROXY = 'http://127.0.0.1:33210'
opener = urllib.request.build_opener(
    urllib.request.ProxyHandler({'http': PROXY, 'https': PROXY}))
BASE = 'https://hikaoxx-tech.github.io/what-are-you/'

local_md5 = hashlib.md5(open('js/app.js', 'rb').read()).hexdigest()
print('本地 app.js md5:', local_md5)

for name, path, markers in [
    ('index.html', 'index.html?v=15', ['id="share-card"', '生成分享卡片', 'sc-quote']),
    ('js/app.js', 'js/app.js?v=15', ['renderShareCard', 'waitIconLoaded']),
    ('css/style.css', 'css/style.css?v=15', ['sc-qr-box']),
]:
    for attempt in range(4):
        try:
            r = opener.open(BASE + path, timeout=30)
            body = r.read()
            text = body.decode('utf-8', errors='replace')
            if name == 'js/app.js':
                m = hashlib.md5(body).hexdigest()
                print(name, r.status, len(body), 'bytes, md5 match:', m == local_md5)
            else:
                print(name, r.status, len(body), 'bytes')
            for mk in markers:
                print('   ', 'OK  ' if mk in text else 'MISS', mk)
            break
        except Exception as e:
            print(name, '尝试 %d ERROR: %s' % (attempt, e))
            time.sleep(2)
