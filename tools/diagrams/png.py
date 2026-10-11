"""Render each diagram page's SVG (the diagram only, per the diagram-design export rule) to a 2x PNG beside it.

python3 tools/diagrams/png.py   # needs Google Chrome; fetches Google Fonts like the page does
"""
import os, re, subprocess, tempfile

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'break-glass', 'diagrams')
FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600'
         '&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">')

for name in sorted(os.listdir(DIR)):
    if not name.endswith('.html'):
        continue
    src = open(os.path.join(DIR, name)).read()
    svg = re.search(r'<svg\b.*?</svg>', src, re.S).group(0)
    _, _, w, h = (float(v) for v in re.search(r'viewBox="([^"]+)"', svg).group(1).split())
    # Light theme only: the PNG sits in docs that may be light or dark, on the diagram's own paper.
    html = (f'<!DOCTYPE html><html data-theme="light"><head><meta charset="utf-8">{FONTS}'
            f'<style>html,body{{margin:0;padding:0;background:#f2efe9}}svg{{display:block;width:{w:g}px;height:{h:g}px}}</style>'
            f'</head><body>{svg}</body></html>')
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False) as t:
        t.write(html)
    out = os.path.join(DIR, name[:-5] + '.png')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
                    f'--window-size={int(w)},{int(h)}', '--virtual-time-budget=6000', f'--screenshot={out}',
                    f'file://{t.name}'], check=True, capture_output=True)
    os.unlink(t.name)
    print(out)
