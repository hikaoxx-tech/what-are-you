# -*- coding: utf-8 -*-
"""《你是什么东西》单文件构建脚本
把 index.html + css + js + 16 张动物 SVG 全部内联为一个 build/index.html，
用于手机 file:// 直开验收（不受目录结构/服务器限制）。

用法：python build/build_single.py
改过源码后重新运行即可，输出覆盖 build/index.html。
"""
import json
import pathlib
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'build' / 'index.html'

html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'css' / 'style.css').read_text(encoding='utf-8')
data_js = (ROOT / 'js' / 'data.js').read_text(encoding='utf-8')
app_js = (ROOT / 'js' / 'app.js').read_text(encoding='utf-8')
html2canvas_js = (ROOT / 'assets' / 'vendor' / 'html2canvas.min.js').read_text(encoding='utf-8')
qrcode_js = (ROOT / 'assets' / 'vendor' / 'qrcode.min.js').read_text(encoding='utf-8')

# 16 张动物 SVG → data URI（utf8 编码，全量转义）
icons = {}
for p in sorted((ROOT / 'assets' / 'animals').glob('*.svg')):
    svg = p.read_text(encoding='utf-8')
    icons[p.stem] = 'data:image/svg+xml;utf8,' + urllib.parse.quote(svg, safe='')
embed = 'var EMBED_ICONS = ' + json.dumps(icons, ensure_ascii=False) + ';'

out = html.replace(
    '<link rel="stylesheet" href="css/style.css">',
    '<style>\n' + css + '\n</style>'
).replace(
    '<script src="assets/vendor/html2canvas.min.js"></script>',
    '<script>\n' + html2canvas_js + '\n</script>'
).replace(
    '<script src="assets/vendor/qrcode.min.js"></script>',
    '<script>\n' + qrcode_js + '\n</script>'
).replace(
    '<script src="js/data.js"></script>',
    '<script>\n' + data_js + '\n</script>'
).replace(
    '<script src="js/app.js"></script>',
    '<script>\n' + embed + '\n</script>\n<script>\n' + app_js + '\n</script>'
)

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(out, encoding='utf-8')
size_kb = OUT.stat().st_size / 1024
print('生成完成:', OUT, f'({size_kb:.0f} KB, {len(icons)} 个图标已内联)')
