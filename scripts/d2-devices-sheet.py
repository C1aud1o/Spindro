# Compone le immagini di scripts/d2-devices-shots.mjs: una riga per stato, quattro colonne (telefono prima/dopo, scrivania prima/dopo).
#   python3 scripts/d2-devices-sheet.py SHOTS_DIR docs/design/d2-devices.png
import sys, os
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
states = [('1-empty', 'empty'), ('2-trainer', 'one trainer connected'), ('3-trainer-hr-click', 'trainer + heart-rate strap + Click'), ('4-searching', 'remembered devices being searched'), ('5-needs-a-tap', 'a device that needs a tap'), ('6-advanced-open', 'advanced options open (before: bottom of the panel)')]
cols = [('before', 'phone'), ('after', 'phone'), ('before', 'desktop'), ('after', 'desktop')]
pw, ph, dw, dh, pad, head = 200, 340, 480, 270, 8, 22
widths = [pw, pw, dw, dw]; rowh = max(ph, dh) + head
W = sum(widths) + pad * (len(cols) + 1); H = 28 + len(states) * (rowh + pad)
sheet = Image.new('RGB', (W, H), (18, 18, 20)); d = ImageDraw.Draw(sheet)
x = pad
for (tag, size), w in zip(cols, widths):
    d.text((x, 8), f'{tag.upper()} · {size}', fill=(217, 255, 61)); x += w + pad
for r, (key, label) in enumerate(states):
    y = 28 + r * (rowh + pad); d.text((pad, y), label, fill=(200, 200, 200)); x = pad
    for (tag, size), w in zip(cols, widths):
        f = os.path.join(src, f'{tag}-{size}-{key}.png')
        if os.path.exists(f):
            im = Image.open(f).convert('RGB'); s = min(w / im.width, (rowh - head) / im.height)
            im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS); sheet.paste(im, (x, y + head))
        x += w + pad
sheet = sheet.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
sheet.save(out, optimize=True); print(out, os.path.getsize(out) // 1024, 'KB', sheet.size)
