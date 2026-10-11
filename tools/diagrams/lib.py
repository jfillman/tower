import math, html, re

PAPER='#f2efe9'; INK='#1b1f24'; MUTED='#5b6570'; SOFT='#838b93'; ACC='#b9791f'; LINK='#2e7ba6'
RULE='rgba(27,31,36,0.12)'
SANS="'Geist', system-ui, sans-serif"; MONO="'Geist Mono', ui-monospace, monospace"; SERIF="'Instrument Serif', serif"

KINDS = {
 'propose':  ('rgba(46,123,166,0.10)', LINK, None),
 'backend':  ('#ffffff', INK, None),
 'focal':    ('rgba(185,121,31,0.08)', ACC, None),
 'store':    ('rgba(27,31,36,0.05)', MUTED, None),
 'external': ('rgba(27,31,36,0.03)', 'rgba(27,31,36,0.30)', None),
 'input':    ('rgba(91,101,112,0.10)', SOFT, None),
 'optional': ('rgba(27,31,36,0.02)', 'rgba(27,31,36,0.20)', '4,3'),
 'security': ('rgba(185,121,31,0.05)', 'rgba(185,121,31,0.50)', '4,4'),
}
def esc(s): return html.escape(s, quote=False)
def up4(v): return int(math.ceil(v/4.0)*4)

def zone(x,y,w,h,text,right=False,center=False):
    lw = up4(len(text)*5.6+16)
    lx = (x+(w-lw)//2) if center else ((x+w-12-lw) if right else (x+12))
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="rgba(27,31,36,0.02)" stroke="rgba(27,31,36,0.16)" stroke-width="0.8"/>'
            f'<rect x="{lx}" y="{y+4}" width="{lw}" height="12" rx="2" fill="{PAPER}"/>'
            f'<text x="{lx+lw/2}" y="{y+13}" fill="{MUTED}" font-size="8" font-family="{MONO}" text-anchor="middle" letter-spacing="0.14em">{esc(text.upper())}</text>')

def node(x,y,w,h,name,sub=None,kind='backend',tag=None,rx=6):
    fill,stroke,dash = KINDS[kind]
    assert len(name)*6.7 <= w-16, f'name too wide: {name} ({len(name)*6.7:.0f} > {w-16})'
    if sub: assert len(sub)*5.0 <= w-12, f'sub too wide: {sub} ({len(sub)*5.0:.0f} > {w-12})'
    d = f' stroke-dasharray="{dash}"' if dash else ''
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{PAPER}"/>'
    s += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="1"{d}/>'
    cx = x + w/2
    if tag:
        tw = up4(len(tag)*5.6+8)
        s += (f'<rect x="{x+8}" y="{y+6}" width="{tw}" height="12" rx="2" fill="transparent" stroke="{stroke}" stroke-opacity="0.5" stroke-width="0.8"/>'
              f'<text x="{x+8+tw/2}" y="{y+15}" fill="{stroke}" font-size="8" font-family="{MONO}" text-anchor="middle" letter-spacing="0.08em">{esc(tag.upper())}</text>')
        ny = y + 38 if sub else y + h/2 + 8
    else:
        ny = y + h/2 + (0 if sub else 4)
        if sub: ny = y + h/2 - 2
    s += f'<text x="{cx}" y="{ny}" fill="{INK}" font-size="12" font-weight="600" font-family="{SANS}" text-anchor="middle">{esc(name)}</text>'
    if sub:
        s += f'<text x="{cx}" y="{ny+16}" fill="{MUTED}" font-size="8" font-family="{MONO}" text-anchor="middle">{esc(sub)}</text>'
    return s

def rounded(points, r=8):
    pts = list(points)
    d = f'M{pts[0][0]},{pts[0][1]}'
    for i in range(1, len(pts)-1):
        p0,p1,p2 = pts[i-1],pts[i],pts[i+1]
        l1 = abs(p1[0]-p0[0])+abs(p1[1]-p0[1]); l2 = abs(p2[0]-p1[0])+abs(p2[1]-p1[1])
        rr = min(r, l1/2, l2/2)
        s1 = ((p1[0]>p0[0])-(p1[0]<p0[0]), (p1[1]>p0[1])-(p1[1]<p0[1]))
        s2 = ((p2[0]>p1[0])-(p2[0]<p1[0]), (p2[1]>p1[1])-(p2[1]<p1[1]))
        a = (p1[0]-s1[0]*rr, p1[1]-s1[1]*rr); b = (p1[0]+s2[0]*rr, p1[1]+s2[1]*rr)
        d += f' L{a[0]:g},{a[1]:g} Q{p1[0]},{p1[1]} {b[0]:g},{b[1]:g}'
    d += f' L{pts[-1][0]},{pts[-1][1]}'
    for i in range(len(pts)-1):
        assert pts[i][0]==pts[i+1][0] or pts[i][1]==pts[i+1][1], f'diagonal segment {pts[i]}->{pts[i+1]}'
    return d

COL = {'muted':(MUTED,'arrow'), 'accent':(ACC,'arrow-accent'), 'link':(LINK,'arrow-link'), 'open':(MUTED,'arrow-open')}
def path(points, color='muted', dashed=False, marker=True, w=1.2):
    c,m = COL[color]
    da = ' stroke-dasharray="5,4"' if dashed else ''
    mk = f' marker-end="url(#{m})"' if marker else ''
    return f'<path d="{rounded(points)}" fill="none" stroke="{c}" stroke-width="{w}"{da}{mk}/>'

def stopx(x,y,color=ACC):
    return (f'<line x1="{x-5}" y1="{y-5}" x2="{x+5}" y2="{y+5}" stroke="{color}" stroke-width="1.6"/>'
            f'<line x1="{x-5}" y1="{y+5}" x2="{x+5}" y2="{y-5}" stroke="{color}" stroke-width="1.6"/>')

def lab(cx, top, text, color=SOFT):
    w = up4(len(text)*5.6+8)
    return (f'<rect x="{cx-w/2:g}" y="{top}" width="{w}" height="12" rx="2" fill="{PAPER}"/>'
            f'<text x="{cx}" y="{top+9}" fill="{color}" font-size="8" font-family="{MONO}" text-anchor="middle" letter-spacing="0.06em">{esc(text.upper())}</text>')

def hlab(x1,x2,y,text,color=SOFT):   # label above a horizontal segment, 6px gap
    return lab((x1+x2)/2, y-18, text, color)
def vlab(x,y1,y2,text,color=SOFT,side='r'):  # label beside a vertical segment, 8px gap
    w = up4(len(text)*5.6+8)
    cx = x + 8 + w/2 if side=='r' else x - 8 - w/2
    return lab(cx, (y1+y2)/2-6, text, color)

def text(x,y,s,size=12,weight=400,fill=INK,anchor='start',mono=False,serif=False,italic=False,ls=None):
    fam = MONO if mono else (SERIF if serif else SANS)
    st = ' font-style="italic"' if italic else ''
    l = f' letter-spacing="{ls}"' if ls else ''
    return f'<text x="{x}" y="{y}" fill="{fill}" font-size="{size}" font-weight="{weight}" font-family="{fam}" text-anchor="{anchor}"{st}{l}>{esc(s)}</text>'

def callout(x,y,s):
    return f'<text x="{x}" y="{y}" fill="{MUTED}" font-size="16" font-family="{SERIF}" font-style="italic">{esc(s)}</text>'

def legend(y, items, W=1000):
    s = f'<line x1="24" y1="{y-12}" x2="{W-24}" y2="{y-12}" stroke="{RULE}" stroke-width="0.8"/>'
    s += text(24,y+8,'LEGEND',8,500,MUTED,mono=True,ls='0.14em')
    x = 96
    for kind,label in items:
        if kind.startswith('dot'):
            col = ACC if kind=='dot-accent' else INK
            s += f'<circle cx="{x+6}" cy="{y+6}" r="{6 if kind=="dot-accent" else 4}" fill="{col}"/>'; adv=20
        elif kind in KINDS:
            f,st,da = KINDS[kind]; d = f' stroke-dasharray="{da}"' if da else ''
            s += f'<rect x="{x}" y="{y}" width="16" height="12" rx="3" fill="{f}" stroke="{st}" stroke-width="1"{d}/>'; adv=24
        else:
            c,_ = COL.get(kind.replace('-dash',''),(MUTED,''))
            da = ' stroke-dasharray="5,4"' if kind.endswith('-dash') else ''
            s += f'<line x1="{x}" y1="{y+6}" x2="{x+20}" y2="{y+6}" stroke="{c}" stroke-width="1.2"{da}/>'; adv=28
        s += text(x+adv,y+9,label,8,400,MUTED,mono=True)
        x += adv + int(len(label)*5.0) + 20
    return s

def defs():
    return (f'<marker id="arrow-open" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polyline points="0 0, 8 3, 0 6" fill="none" stroke="{MUTED}" stroke-width="1.2"/></marker>'
            f'<marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{MUTED}"/></marker>'
            f'<marker id="arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{ACC}"/></marker>'
            f'<marker id="arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{LINK}"/></marker>')

CSS = f"""
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{--paper:{PAPER};--paper-2:#e8e3da;--ink:{INK};--muted:{MUTED};--soft:{SOFT};--accent:{ACC};--link:{LINK};--rule:{RULE};
--card:#fff;--font-sans:'Geist',system-ui,sans-serif;--font-serif:'Instrument Serif',serif;--font-mono:'Geist Mono',ui-monospace,monospace}}
body{{font-family:var(--font-sans);background:var(--paper);color:var(--ink);padding:2.5rem 2rem 2rem}}
.frame{{max-width:1120px;margin:0 auto}}
.eyebrow{{font-family:var(--font-mono);font-size:.66rem;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:.5rem}}
h1{{font-family:var(--font-serif);font-size:clamp(1.5rem,2.4vw + .75rem,2rem);font-weight:400;letter-spacing:-.02em;line-height:1.15;margin-bottom:.5rem}}
.lede{{color:var(--muted);font-size:.9rem;line-height:1.5;max-width:70ch;margin-bottom:1.25rem}}
.fig{{overflow-x:auto}}
svg{{width:100%;min-width:900px;display:block}}
.cards{{display:grid;grid-template-columns:1.15fr 1fr 1.05fr;gap:.75rem;margin-top:1.25rem}}
.card{{background:var(--card);border:1px solid var(--rule);border-radius:6px;padding:1rem 1.1rem}}
.card .eyebrow{{margin-bottom:.35rem}}
.card p,.card li{{font-size:.8rem;line-height:1.5;color:var(--ink)}}
.card ul{{padding-left:1rem}}
.card .dot{{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:.4rem;background:var(--muted)}}
.card .dot.accent{{background:var(--accent)}} .card .dot.link{{background:var(--link)}}
.foot{{font-family:var(--font-mono);font-size:.62rem;letter-spacing:.06em;color:var(--soft);border-top:1px solid var(--rule);margin-top:1.25rem;padding-top:.6rem;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}}
.foot a{{color:var(--link);text-decoration:none}}
@media (max-width:900px){{.cards{{grid-template-columns:1fr}}}}
@media print{{@page{{size:landscape;margin:10mm}}body{{padding:0}}.cards{{margin-top:.75rem}}}}
"""

FOOTER = 'Tower · Break-glass'

# Dark theme. The SVG uses presentation attributes (fill="#5b6570"), and a CSS rule beats a
# presentation attribute, so each page maps the colours it actually uses to their dark
# equivalents. Applies under prefers-color-scheme: dark unless the page (or its embedder)
# sets data-theme="light", and always under data-theme="dark".
DARK = {
    PAPER: '#131619', '#e8e3da': '#1b1f24', '#ffffff': '#1c2127', INK: '#e8e4dc',
    MUTED: '#a1aab3', SOFT: '#7f8891', ACC: '#e8a33d', LINK: '#6fb2d9',
}
_RGBA_DARK = {  # light rgb -> (dark rgb, alpha boost)
    (27, 31, 36): ((232, 228, 220), 1.0),
    (185, 121, 31): ((232, 163, 61), 1.3),
    (91, 101, 112): ((161, 170, 179), 1.0),
    (46, 123, 166): ((111, 178, 217), 1.3),
}
DARK_VARS = (f"--paper:{DARK[PAPER]};--paper-2:#1b1f24;--ink:{DARK[INK]};--muted:{DARK[MUTED]};--soft:{DARK[SOFT]};"
             f"--accent:{DARK[ACC]};--link:{DARK[LINK]};--rule:rgba(232,228,220,0.14);--card:#1a1e23")

def dark_colour(c):
    if c in DARK:
        return DARK[c]
    m = re.fullmatch(r'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)', c)
    if m:
        rgb = tuple(int(v) for v in m.groups()[:3])
        if rgb in _RGBA_DARK:
            (r, g, b), k = _RGBA_DARK[rgb]
            return f'rgba({r},{g},{b},{min(1.0, float(m.group(4)) * k):.3g})'
    return None

def dark_css(svg):
    rules = []
    for attr, val in sorted(set(re.findall(r'\b(fill|stroke)="([^"]+)"', svg))):
        d = dark_colour(val)
        if d:
            rules.append(f'svg [{attr}="{val}"]{{{attr}:{d}}}')
    body = f'{{{DARK_VARS}}}'
    sel = '\n'.join(rules)
    return (f"@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){body}\n"
            + '\n'.join(f':root:not([data-theme=light]) {r}' for r in rules) + "}\n"
            + f":root[data-theme=dark]{body}\n"
            + '\n'.join(f':root[data-theme=dark] {r}' for r in rules) + "\n")

def page(slug, eyebrow, title, desc, svg_body, W, H, lede='', cards=(), nav='', y0=0):
    cs = ''
    for (eb, dot, body) in cards:
        cs += f'<div class="card"><p class="eyebrow"><span class="dot {dot}"></span>{esc(eb)}</p>{body}</div>'
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>{CSS}{dark_css(defs() + svg_body + f'<rect fill="{PAPER}"/>')}</style>
</head>
<body>
<div class="frame">
<p class="eyebrow">{esc(eyebrow)}</p>
<h1>{esc(title)}</h1>
<p class="lede">{esc(lede)}</p>
<div class="fig">
<svg viewBox="0 {y0} {W} {H-y0}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="{slug}-title {slug}-desc">
<title id="{slug}-title">{esc(title)}</title>
<desc id="{slug}-desc">{esc(desc)}</desc>
<defs>{defs()}</defs>
<rect width="100%" height="100%" fill="{PAPER}"/>
{svg_body}
</svg>
</div>
<div class="cards">{cs}</div>
<div class="foot"><span>{FOOTER}</span><span>{nav}</span></div>
</div>
</body>
</html>
"""
