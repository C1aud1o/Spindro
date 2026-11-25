#!/usr/bin/env python3
"""U4/U5 liquid glass: contact sheets from the screenshots of scripts/u4-shots.mjs and scripts/u4-mini-shots.mjs.
   python3 scripts/u4-sheets.py BEFORE_DIR AFTER_DIR MINI_BEFORE_DIR MINI_AFTER_DIR [OUT_DIR=docs/design] [FIRSTPASS_DIR]
Writes u4-glass-app.png, u4-glass-games.png, u4-glass-a11y.png and u4-glass-mini.png (the new look is what the owner approves in the app)."""
import sys, os
from PIL import Image, ImageDraw, ImageFont

B, A, MB, MA = sys.argv[1:5]
OUT = sys.argv[5] if len(sys.argv) > 5 else 'docs/design'
P1 = sys.argv[6] if len(sys.argv) > 6 else None   # screenshots of the first pass (U4), for u5-compare.png
INK = (15, 15, 13); LIME = (217, 255, 61); DIM = (160, 158, 148)
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'; FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font = lambda s, b=False: ImageFont.truetype(FB if b else F, s)

def load(d, name, w=None, h=None):
    p = os.path.join(d, name + '.png')
    if not os.path.exists(p): return None
    im = Image.open(p).convert('RGB')
    if w: im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
    elif h: im = im.resize((int(im.width * h / im.height), h), Image.LANCZOS)
    return im

class Sheet:
    def __init__(self, width, title, sub):
        self.w = width; self.items = []; self.y = 0; self.title = title; self.sub = sub; self.ops = []
        self.y = 20 + 34 + 24 + 20
    def heading(self, text):
        self.ops.append(('h', self.y + 8, text)); self.y += 8 + 22 + 10
    def row(self, cells, gap=10):
        """cells: [(image|None, caption)] laid out left to right, vertically top-aligned"""
        x = 20; hmax = 0
        for im, cap in cells:
            if im is None: continue
            self.ops.append(('i', x, self.y, im)); self.ops.append(('c', x, self.y + im.height + 4, cap)); x += im.width + gap; hmax = max(hmax, im.height)
        self.y += hmax + 4 + 18 + 14
    def save(self, path):
        img = Image.new('RGB', (self.w, self.y + 10), INK); d = ImageDraw.Draw(img)
        d.text((20, 18), self.title, font=font(26, True), fill=LIME); d.text((20, 54), self.sub, font=font(14), fill=DIM)
        for op in self.ops:
            if op[0] == 'h': d.text((20, op[1]), op[2].upper(), font=font(13, True), fill=LIME)
            elif op[0] == 'i': img.paste(op[3], (op[1], op[2]))
            else: d.text((op[1], op[2]), op[3], font=font(12), fill=DIM)
        img.save(path, optimize=True); print(path, os.path.getsize(path) // 1024, 'KB', img.size)

def shot(d, n, vp, **k): return load(d, f'{n}-{vp}', **k)

# ---------- app ----------
APP = [('home', 'Home'), ('dashboard', 'Ride + workout'), ('workouts', 'Workouts'), ('devices', 'Devices'), ('settings', 'Settings'), ('history', 'History'), ('clickmenu', 'Click menu'), ('dialog', 'Dialog'), ('toast', 'Toast')]
s = Sheet(1900, 'U5 · Spindro liquid glass: the app', 'Before (top) and after (below), rendered from the real code with a fake trainer and a fake Click. Not photos of real devices.')
s.heading('Phone 390 × 844')
s.row([(shot(B, f'app-{k}', 'phone', w=200), f'before · {t}') for k, t in APP])
s.row([(shot(A, f'app-{k}', 'phone', w=200), f'after · {t}') for k, t in APP])
s.heading('Desktop 1280 × 720')
pairs = [(k, t) for k, t in APP]
for i in range(0, len(pairs), 2):
    cells = []
    for k, t in pairs[i:i + 2]: cells += [(shot(B, f'app-{k}', 'desktop', w=462), f'before · {t}'), (shot(A, f'app-{k}', 'desktop', w=462), f'after · {t}')]
    s.row(cells)
s.save(os.path.join(OUT, 'u4-glass-app.png'))

# ---------- games ----------
G = [('games-menu', 'Game menu'), ('games-horde-play', 'Horde Run, workout strip'), ('games-gruppetto-play', 'Slipstream, workout strip')]
s = Sheet(1900, 'U5 · Spindro liquid glass: games', 'Game menu (DOM, glass) and the in-game HUD (canvas, tinted glass without any blur over WebGL), with the shared workout strip. Before (top) and after (below).')
s.heading('Phone 390 × 844')
s.row([(shot(B, k, 'phone', h=560), f'before · {t}') for k, t in G])
s.row([(shot(A, k, 'phone', h=560), f'after · {t}') for k, t in G])
s.heading('Desktop 1280 × 720')
for k, t in G:
    s.row([(shot(B, k, 'desktop', w=930), f'before · {t}'), (shot(A, k, 'desktop', w=930), f'after · {t}')])
s.save(os.path.join(OUT, 'u4-glass-games.png'))

# ---------- accessibility variants (new look) ----------
s = Sheet(1900, 'U5 · Spindro liquid glass: accessibility', 'Reduce transparency (solid panels), high contrast (prefers-contrast: more) and the keyboard focus ring, new look only.')
s.heading('Reduce transparency · phone')
s.row([(shot(A, 'a11y-solid-dashboard', 'phone', h=520), 'ride + workout'), (shot(A, 'a11y-solid-settings', 'phone', h=520), 'settings'),
       (shot(A, 'a11y-contrast-settings', 'phone', h=520), 'high contrast · settings'), (shot(A, 'a11y-focus-home', 'phone', h=520), 'focus ring · home'), (shot(A, 'a11y-focus-settings', 'phone', h=520), 'focus ring · settings')])
s.heading('Desktop')
s.row([(shot(A, 'a11y-solid-dashboard', 'desktop', w=620), 'reduce transparency · ride + workout'), (shot(A, 'a11y-solid-settings', 'desktop', w=620), 'reduce transparency · settings'), (shot(A, 'a11y-contrast-settings', 'desktop', w=620), 'high contrast · settings')])
s.row([(shot(A, 'a11y-focus-home', 'desktop', w=620), 'focus ring · home'), (shot(A, 'a11y-focus-settings', 'desktop', w=620), 'focus ring · settings')])
s.save(os.path.join(OUT, 'u4-glass-a11y.png'))

# ---------- mini window + popup ----------
M = [('mini-spindro', 'Mini window · workout'), ('mini-remote', 'Mini window · Remote mode'), ('mini-paused', 'Mini window · paused'), ('popup', 'Extension popup')]
s = Sheet(1900, 'U5 · Spindro liquid glass: mini window and extension popup', 'Before (top) and after (below). The mini window is a Document Picture-in-Picture window; the popup is the Spindro Remote extension.')
s.row([(load(MB, k, h=520), f'before · {t}') for k, t in M])
s.row([(load(MA, k, h=520), f'after · {t}') for k, t in M])
s.save(os.path.join(OUT, 'u4-glass-mini.png'))

# ---------- u5-compare: original flat / first pass / this pass ----------
if P1:
    C = [('home', 'Home'), ('dashboard', 'Ride + workout'), ('workouts', 'Workouts sheet'), ('settings', 'Settings'), ('clickmenu', 'Click menu'), ('dialog', 'Dialog')]
    s = Sheet(1900, 'U5 · original flat / first pass (U4) / this pass (U5)', 'Same screens, same data, rendered from the real code at each stage. Left: the flat original. Middle: the first glass pass. Right: this pass.')
    s.heading('Phone 390 × 844')
    s.row([(shot(d, f'app-{k}', 'phone', h=420), f'{n} · {t}') for k, t in C[:3] for d, n in ((B, 'orig'), (P1, 'U4'), (A, 'U5'))])
    s.row([(shot(d, f'app-{k}', 'phone', h=420), f'{n} · {t}') for k, t in C[3:] for d, n in ((B, 'orig'), (P1, 'U4'), (A, 'U5'))])
    s.heading('Desktop 1280 × 720')
    for k, t in C:
        s.row([(shot(d, f'app-{k}', 'desktop', w=612), f'{n} · {t}') for d, n in ((B, 'original'), (P1, 'first pass'), (A, 'this pass'))])
    s.save(os.path.join(OUT, 'u5-compare.png'))
