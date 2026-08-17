# -*- coding: utf-8 -*-
"""生成标题字体子集：assets/fonts/wa-display.woff2

display 字体只用于"签名时刻"标题（封面标题 / 结果页人格名 / 画廊人格名），
所以只需收集这些固定用字 + 常用标点数字，从思源宋体 Heavy 子集化，
把 24MB OTF 压成 ~100KB 的 WOFF2，零 CDN、微信可加载。

用法：python build/gen_font_subset.py
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'fonts' / 'SourceHanSerifSC-Heavy.otf'
OUT = ROOT / 'assets' / 'fonts' / 'wa-display.woff2'

# 所有使用 display 字体的固定文本（新增标题用字时在这里补）
TEXTS = [
    '你是什么东西？',
    '听我的', '试试就逝世', '吃了吗', '再来一个', '你服吗', '杠上开花',
    '为了你好', '下次一定', '你超纲了', '别问', '没事的', '别问了',
    '我的错？', '马上好', '我懂了', '我想开了',
    '「」·…！、，。0123456789 ',  # 常用标点 + 数字保险
]

chars = sorted({c for t in TEXTS for c in t})
unicodes = ','.join('U+%04X' % ord(c) for c in chars)
print('字符数:', len(chars), '->', ''.join(chars))

cmd = [
    sys.executable, '-m', 'fontTools.subset', str(SRC),
    '--flavor=woff2', '--output-file=' + str(OUT),
    '--unicodes=' + unicodes,
    '--no-hinting', '--desubroutinize', '--layout-features=*',
]
subprocess.run(cmd, check=True)
print('生成完成:', OUT, '(%d KB)' % (OUT.stat().st_size / 1024))
