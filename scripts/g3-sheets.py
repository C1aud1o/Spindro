#!/usr/bin/env python3
"""Builds the contact sheets in docs/design from the frames recorded with scripts/light-shots.mjs and scripts/g3-shots.mjs.

  python3 scripts/g3-sheets.py scale  <before_dir> <after_dir> <out.png>   horde + mattoni, desktop + phone, before / after
  python3 scripts/g3-sheets.py light  <before_dir> <after_dir> <out.png>   six games x quality low / medium / high, before / after (phone)
  python3 scripts/g3-sheets.py strip  <dir> <out.png>                      the workout strip in each game, with and without a workout

Frames are named as the recording scripts write them. Background #0F0F0D like the app."""
import sys
from PIL import Image, ImageDraw, ImageFont

BG = (15, 15, 13); FG = (240, 240, 232); LIME = (217, 255, 61); DIM = (150, 150, 140)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(n): return ImageFont.truetype(FONT, n)
def open_(p):
    try: return Image.open(p).convert('RGB')
    except FileNotFoundError: return Image.new('RGB', (390, 780), (60, 20, 20))
def fit(im, h): return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
def sheet(w, h, title):
    im = Image.new('RGB', (w, h), BG); d = ImageDraw.Draw(im); d.text((24, 16), title, font=font(26), fill=LIME); return im, d

def scale(b, a, out):
    pad = 18; top = 64; rowh = 420
    cols = [('desktop 1280x720', '-d', 1), ('phone 390x844', '-p', 1)]
    rows = [('Horde Run', 'horde'), ('Feed Zone', 'mattoni')]
    tiles = []
    for name, g in rows:
        r = []
        for cname, tag, _ in cols:
            for lab, d in (('before', b), ('after', a)):
                r.append((f'{name} · {cname} · {lab}', fit(open_(f'{d}/{g}-high-90{tag}.png'), rowh)))
        tiles.append(r)
    W = pad + max(sum(t[1].width + pad for t in r) for r in tiles); H = top + len(rows) * (rowh + 40 + pad)
    im, d = sheet(W, H, 'G3 scale: characters pulled back to a readable playfield (high quality, 90 s into a run)')
    y = top
    for r in tiles:
        x = pad
        for lab, t in r:
            d.text((x, y), lab, font=font(14), fill=FG); im.paste(t, (x, y + 24)); x += t.width + pad
        y += rowh + 40 + pad
    im.save(out)

GAMES = [('shooter', 'Pedal Strike'), ('horde', 'Horde Run'), ('gruppetto', 'Slipstream'), ('racer', 'Breakaway'), ('planata', 'Updraft'), ('mattoni', 'Feed Zone')]
def light(b, a, out):
    pad = 12; top = 96; th = 430
    cells = [(q, lab, d) for q in ('low', 'medium', 'high') for lab, d in (('before', b), ('after', a))]
    tw = round(390 * th / 780)
    W = pad + len(GAMES) * (tw + pad) + 150; H = top + len(cells) * (th + 26 + pad) // 1
    # one row per (quality, before/after), one column per game
    im, d = sheet(W, H, 'G3 light: matte look, no halos, bloom threshold high / strength low on every preset (390x780, 90 s into a run)')
    for i, (gid, name) in enumerate(GAMES): d.text((150 + pad + i * (tw + pad), 62), name, font=font(16), fill=FG)
    y = top
    for q, lab, dd in cells:
        d.text((pad, y + th // 2 - 14), f'{q}', font=font(20), fill=LIME if lab == 'after' else FG); d.text((pad, y + th // 2 + 12), lab, font=font(15), fill=DIM)
        for i, (gid, name) in enumerate(GAMES):
            im.paste(fit(open_(f'{dd}/{gid}-{q}-90.png'), th), (150 + pad + i * (tw + pad), y))
        y += th + 26 + pad
    im.save(out)

def strip(dr, out):
    pad = 12
    items = [g for g, _ in GAMES] + ['video']
    names = dict(GAMES); names['video'] = 'Video ride'
    rows = [('plan', 'no workout: the game\'s own plan'), ('wk', 'with a workout')]
    sizes = [('1280x720', 'desktop', 380), ('390x844', 'phone', 380)]
    cellw = {}; # per size row height 380
    tiles = []
    for gid in items:
        for key, klabel in rows:
            if gid == 'video' and key == 'plan': continue
            for sz, slabel, hh in sizes:
                tiles.append((f'{names[gid]} · {klabel} · {slabel}', fit(open_(f'{dr}/{gid}-{key}-{sz}.png'), hh)))
    # layout: wrap into rows of ~ 1900 px
    maxw = 2100; x = pad; y = 70; rowh = 0; pos = []
    for lab, t in tiles:
        if x + t.width + pad > maxw: x = pad; y += rowh + 40; rowh = 0
        pos.append((lab, t, x, y)); x += t.width + pad; rowh = max(rowh, t.height)
    im, d = sheet(maxw, y + rowh + 50, 'G3 workout strip: one component in all six games and the video ride (desktop + phone, with and without a workout)')
    for lab, t, x, y in pos:
        d.text((x, y), lab, font=font(13), fill=FG); im.paste(t, (x, y + 20))
    im.save(out)

if __name__ == '__main__':
    k = sys.argv[1]
    if k == 'scale': scale(*sys.argv[2:5])
    elif k == 'light': light(*sys.argv[2:5])
    elif k == 'strip': strip(*sys.argv[2:4])
