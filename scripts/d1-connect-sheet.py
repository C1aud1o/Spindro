# Compone le immagini di scripts/d1-connect-shots.mjs in una contact sheet leggera: python3 scripts/d1-connect-sheet.py SHOTS_DIR docs/design/d1-connect.png
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(src, '*.png')))
cols, tw, th = 8, 260, 540
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 22)), (18, 18, 20))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB')
    s = min((tw - 8) / im.width, (th - 4) / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    x, y = (i % cols) * tw + 4, (i // cols) * (th + 22)
    d.text((x + 2, y + 4), os.path.basename(f)[:-4], fill=(200, 200, 200))
    sheet.paste(im, (x, y + 20))
sheet = sheet.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
sheet.save(out, optimize=True)
print(out, os.path.getsize(out) // 1024, 'KB', sheet.size)
