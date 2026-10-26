# Renders build/icon.png (1024px, macOS icon grid) and build/icon.icns.
import os, subprocess, shutil
from PIL import Image, ImageDraw, ImageFilter

S = 1024
SS = 4  # supersample for smooth edges
W = S * SS
img = Image.new('RGBA', (W, W), (0, 0, 0, 0))

body = 824 * SS
off = (W - body) // 2
radius = 185 * SS

# Soft drop shadow
shadow = Image.new('RGBA', (W, W), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([off, off + 18 * SS, off + body, off + body + 18 * SS], radius, fill=(0, 0, 0, 120))
shadow = shadow.filter(ImageFilter.GaussianBlur(22 * SS))
img.alpha_composite(shadow)

# Vertical gradient body
grad = Image.new('RGBA', (W, W))
top, bottom = (36, 42, 66), (12, 14, 22)
gd = ImageDraw.Draw(grad)
for y in range(W):
    t = min(1, max(0, (y - off) / body))
    gd.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
mask = Image.new('L', (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle([off, off, off + body, off + body], radius, fill=255)
img.paste(grad, (0, 0), mask)

# Accent glow behind the prompt
glow = Image.new('RGBA', (W, W), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([off + 120 * SS, off + 200 * SS, off + 700 * SS, off + 680 * SS], fill=(124, 156, 255, 70))
glow = glow.filter(ImageFilter.GaussianBlur(90 * SS))
img.alpha_composite(Image.composite(glow, Image.new('RGBA', (W, W), (0, 0, 0, 0)), mask))


d = ImageDraw.Draw(img)
accent = (138, 166, 255, 255)
lw = 64 * SS
cx, cy = off + 250 * SS, off + 412 * SS
# ">" chevron with round caps
pts = [(cx, cy - 130 * SS), (cx + 150 * SS, cy), (cx, cy + 130 * SS)]
d.line(pts, fill=accent, width=lw, joint='curve')
for p in (pts[0], pts[2]):
    d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=accent)
# "_" cursor
ux0, ux1, uy = off + 440 * SS, off + 600 * SS, cy + 130 * SS
d.line([(ux0, uy), (ux1, uy)], fill=(230, 235, 255, 255), width=lw)
for x in (ux0, ux1):
    d.ellipse([x - lw / 2, uy - lw / 2, x + lw / 2, uy + lw / 2], fill=(230, 235, 255, 255))

out = img.resize((S, S), Image.LANCZOS)
here = os.path.dirname(os.path.abspath(__file__))
out.save(os.path.join(here, 'icon.png'))

iconset = os.path.join(here, 'icon.iconset')
shutil.rmtree(iconset, ignore_errors=True)
os.makedirs(iconset)
for size in (16, 32, 128, 256, 512):
    out.resize((size, size), Image.LANCZOS).save(f'{iconset}/icon_{size}x{size}.png')
    out.resize((size * 2, size * 2), Image.LANCZOS).save(f'{iconset}/icon_{size}x{size}@2x.png')
subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', os.path.join(here, 'icon.icns')], check=True)
shutil.rmtree(iconset)
print('ok')
