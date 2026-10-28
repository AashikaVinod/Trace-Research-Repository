#!/usr/bin/env python3
"""
Draws the illustrated "sources" for the sample study (assets/sources/*.webp):
whiteboards with sticky notes, sketchbook wireframes, notebook pages.

They are ILLUSTRATIONS standing in for photos of real research artefacts,
drawn with a handwriting font (Caveat / Kalam, SIL OFL) and given a slight
tilt, shadow, uneven light and grain so they read like photographs.
All text comes from the fictional sample study.

Usage: python3 tools/generate_sources.py [path/to/fonts]   (needs Pillow + numpy)
"""
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONTS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/tmp/hand')
OUT = Path(__file__).resolve().parent.parent / 'assets' / 'sources'
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1400, 1000


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


MARKER = lambda s: font('kalam-700.ttf', s)
HAND = lambda s: font('caveat.ttf', s)
PENCIL = lambda s: font('caveat-400.ttf', s)

INK = {'black': (38, 40, 48), 'blue': (32, 78, 168), 'red': (196, 52, 46), 'green': (30, 120, 80), 'pencil': (92, 92, 96)}
STICKY = {'yellow': (255, 231, 120), 'pink': (255, 176, 196), 'blue': (166, 212, 255), 'green': (178, 236, 180), 'orange': (255, 196, 140)}


def wobbly_line(draw, points, color, width=5, jitter=1.6):
    """A hand-drawn line: the points get small random offsets."""
    pts = []
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        steps = max(2, int(math.hypot(x2 - x1, y2 - y1) / 18))
        for i in range(steps):
            t = i / steps
            pts.append((x1 + (x2 - x1) * t + random.uniform(-jitter, jitter), y1 + (y2 - y1) * t + random.uniform(-jitter, jitter)))
    pts.append(points[-1])
    draw.line(pts, fill=color, width=width, joint='curve')


def arrow(draw, start, end, color, width=5):
    wobbly_line(draw, [start, end], color, width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    for side in (-0.5, 0.5):
        tip = (end[0] - 26 * math.cos(angle + side), end[1] - 26 * math.sin(angle + side))
        wobbly_line(draw, [end, tip], color, width)


def loop(draw, box, color, width=5):
    """A hand-drawn circle around an area."""
    x0, y0, x1, y1 = box
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    pts = [(cx + (rx + random.uniform(-6, 6)) * math.cos(a), cy + (ry + random.uniform(-6, 6)) * math.sin(a))
           for a in np.linspace(0.2, 2 * math.pi + 0.5, 40)]
    draw.line(pts, fill=color, width=width, joint='curve')


def write(draw, xy, text, fnt, color, max_width=None, spacing=6):
    """Handwritten text, wrapped to a width, with a little wobble per line."""
    words, lines, line = text.split(), [], ''
    for word in words:
        test = (line + ' ' + word).strip()
        if max_width and draw.textlength(test, font=fnt) > max_width and line:
            lines.append(line)
            line = word
        else:
            line = test
    lines.append(line)
    x, y = xy
    for ln in lines:
        draw.text((x + random.uniform(-2, 2), y), ln, font=fnt, fill=color)
        y += fnt.size + spacing
    return y


def sticky(canvas, xy, text, colour, size=(230, 200), angle=None):
    """A sticky note with a soft shadow, pasted at a slight angle."""
    note = Image.new('RGBA', (size[0] + 40, size[1] + 40), (0, 0, 0, 0))
    shadow = Image.new('RGBA', note.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rectangle([24, 26, size[0] + 24, size[1] + 26], fill=(0, 0, 0, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(7))
    note.alpha_composite(shadow)
    d = ImageDraw.Draw(note)
    d.rectangle([16, 16, size[0] + 16, size[1] + 16], fill=STICKY[colour] + (255,))
    d.rectangle([16, 16, size[0] + 16, 48], fill=tuple(max(0, c - 14) for c in STICKY[colour]) + (255,))  # sticky strip
    write(d, (30, 52), text, HAND(34), INK['black'], max_width=size[0] - 26, spacing=2)
    note = note.rotate(angle if angle is not None else random.uniform(-5, 5), resample=Image.BICUBIC, expand=True)
    canvas.alpha_composite(note, (int(xy[0]), int(xy[1])))


def surface(kind):
    """The paper or board, with gentle texture."""
    rng = np.random.default_rng(random.randint(0, 9999))
    if kind == 'whiteboard':
        base = np.array([238, 240, 240], float)
    elif kind == 'sketchbook':
        base = np.array([246, 240, 226], float)
    elif kind == 'notebook':
        base = np.array([250, 248, 240], float)
    else:  # dotgrid
        base = np.array([248, 246, 238], float)
    noise = rng.normal(0, 3.0, (H, W, 1))
    blotch = np.asarray(Image.fromarray((rng.random((12, 16)) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), float)[..., None] / 255
    img = np.clip(base + noise - blotch * 8, 0, 255).astype(np.uint8)
    canvas = Image.fromarray(img).convert('RGBA')
    d = ImageDraw.Draw(canvas)
    if kind == 'whiteboard':  # faint ghosts of erased marker
        for _ in range(9):
            x, y = random.randint(0, W), random.randint(0, H)
            d.line([(x, y), (x + random.randint(80, 300), y + random.randint(-40, 40))], fill=(214, 218, 222, 255), width=random.randint(6, 14))
    if kind == 'notebook':
        for y in range(150, H, 52):
            d.line([(0, y), (W, y)], fill=(176, 204, 232, 255), width=2)
        d.line([(120, 0), (120, H)], fill=(232, 150, 150, 255), width=3)
    if kind == 'dotgrid':
        for y in range(40, H, 40):
            for x in range(40, W, 40):
                d.ellipse([x - 1.6, y - 1.6, x + 1.6, y + 1.6], fill=(190, 186, 176, 255))
    if kind == 'sketchbook':
        for y in range(60, H - 40, 70):  # spiral holes along the top-left edge feel
            d.ellipse([22, y, 40, y + 18], fill=(70, 66, 60, 255))
    return canvas


def photograph(canvas, name, background=(64, 58, 52)):
    """Make the flat drawing look photographed: tilt, shadow, uneven light, grain."""
    angle = random.uniform(-2.2, 2.2)
    page = canvas.rotate(angle, resample=Image.BICUBIC, expand=True)
    out_w, out_h = page.width + 120, page.height + 120
    photo = Image.new('RGBA', (out_w, out_h), background + (255,))
    shadow = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 120), (70, 82), page.split()[3])
    photo.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)))
    photo.alpha_composite(page, (60, 60))
    arr = np.asarray(photo.convert('RGB'), float)
    yy, xx = np.mgrid[0:out_h, 0:out_w]
    cx, cy = out_w * random.uniform(0.3, 0.7), out_h * random.uniform(0.25, 0.5)
    light = 1.06 - 0.22 * (((xx - cx) / out_w) ** 2 + ((yy - cy) / out_h) ** 2) ** 0.5 * 2
    warm = np.array([1.0, 0.985, 0.95])
    arr = arr * light[..., None] * warm + np.random.default_rng(1).normal(0, 4, arr.shape)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    img = img.resize((1200, int(1200 * img.height / img.width)), Image.LANCZOS)
    path = OUT / f'{name}.webp'
    img.save(path, 'WEBP', quality=78, method=6)
    print(f'{path.name}: {path.stat().st_size // 1024} KB')


def phone(draw, box, color, title, rows):
    """A quick wireframe of a phone screen."""
    x0, y0, x1, y1 = box
    wobbly_line(draw, [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], color, 4)
    wobbly_line(draw, [((x0 + x1) / 2 - 30, y0 + 18), ((x0 + x1) / 2 + 30, y0 + 18)], color, 3)
    write(draw, (x0 + 22, y0 + 40), title, MARKER(30), color, max_width=x1 - x0 - 40)
    y = y0 + 110
    for row in rows:
        if row == 'button':
            wobbly_line(draw, [(x0 + 24, y1 - 80), (x1 - 24, y1 - 80), (x1 - 24, y1 - 30), (x0 + 24, y1 - 30), (x0 + 24, y1 - 80)], color, 3)
        elif row == 'lines':
            for i in range(3):
                wobbly_line(draw, [(x0 + 24, y + i * 26), (x1 - 40 - random.randint(0, 60), y + i * 26)], color, 3)
            y += 96
        else:
            write(draw, (x0 + 24, y), row, PENCIL(28), color, max_width=x1 - x0 - 40)
            y += 52


def main():
    random.seed(7)

    # 1. Affinity map on a whiteboard (Mobile banking onboarding)
    c = surface('whiteboard'); d = ImageDraw.Draw(c)
    write(d, (60, 36), 'Why do people drop off? (sessions 1-4)', MARKER(50), INK['blue'])
    sticky(c, (70, 150), 'P-01: no utility bill on phone, closed app', 'yellow')
    sticky(c, (320, 170), 'P-03 left to find a letter, form reset!', 'yellow')
    sticky(c, (190, 400), 'P-02: does another bank statement count?', 'yellow')
    sticky(c, (800, 150), 'Camera prompt: "why do you need this?"', 'pink')
    sticky(c, (1050, 180), 'Selfie check was quick once started', 'green')
    sticky(c, (860, 430), 'P-04 wanted a checklist up front', 'blue')
    sticky(c, (1100, 470), 'Enlarged text cuts the Continue button', 'orange')
    loop(d, (40, 120, 620, 680), INK['red'], 6)
    write(d, (110, 700), 'PROOF OF ADDRESS = main drop-off', MARKER(40), INK['red'])
    arrow(d, (640, 560), (840, 560), INK['black'])
    write(d, (650, 600), 'people need to know what to prepare', HAND(36), INK['black'], max_width=320)
    write(d, (760, 820), 'next: synthesise into insights (Ananya)', HAND(36), INK['green'])
    photograph(c, 'banking-affinity-map', background=(88, 84, 78))

    # 2. Sketchbook wireframes of account opening
    c = surface('sketchbook'); d = ImageDraw.Draw(c)
    write(d, (90, 30), 'Account opening: where it breaks', MARKER(46), INK['pencil'])
    phone(d, (110, 130, 400, 720), INK['pencil'], 'Your details', ['lines', 'lines', 'button'])
    phone(d, (520, 130, 810, 720), INK['pencil'], 'Proof of address', ['Upload a utility bill', 'lines', 'button'])
    phone(d, (930, 130, 1220, 720), INK['pencil'], 'Selfie check', ['Allow camera?', 'lines', 'button'])
    loop(d, (540, 250, 790, 420), INK['red'], 5)
    arrow(d, (860, 800), (700, 470), INK['red'])
    write(d, (820, 800), '3 of 4 people stopped here', HAND(40), INK['red'])
    write(d, (130, 760), 'idea: show "what you\'ll need" BEFORE step 1', HAND(40), INK['blue'], max_width=620)
    write(d, (130, 870), 'save a draft so leaving the app is OK', HAND(40), INK['blue'], max_width=620)
    photograph(c, 'banking-wireframe-sketch', background=(120, 104, 86))

    # 3. Interview notebook page
    c = surface('notebook'); d = ImageDraw.Draw(c)
    write(d, (150, 60), 'Session 3, P-03, 12 Aug', MARKER(44), INK['blue'])
    y = 150
    for line, colour in [('- opened account flow on the bus', 'blue'), ('- "I don\'t have a bill on my phone"', 'blue'),
                         ('- switched to email to find council letter', 'blue'), ('- came back... form had RESET', 'red'),
                         ('- selfie check: "easier than expected"', 'green'), ('- would come back later if it saved', 'blue'),
                         ('  -> link to finding: progress is lost', 'black')]:
        write(d, (150, y + 6), line, HAND(44), INK[colour]); y += 104
    loop(d, (130, 440, 760, 560), INK['red'], 4)
    write(d, (900, 180), '* key quote', HAND(44), INK['red'])
    photograph(c, 'banking-interview-notes-p03', background=(70, 66, 74))

    # 4. Checkout journey map (Grocery checkout friction)
    c = surface('whiteboard'); d = ImageDraw.Draw(c)
    write(d, (60, 36), 'Checkout journey: how it feels', MARKER(50), INK['blue'])
    steps = ['Basket', 'Fees', 'Slot', 'Payment', 'Done']
    for i, step in enumerate(steps):
        x = 120 + i * 270
        wobbly_line(d, [(x - 60, 160), (x + 100, 160), (x + 100, 230), (x - 60, 230), (x - 60, 160)], INK['black'], 4)
        write(d, (x - 40, 170), step, MARKER(38), INK['black'])
    feel = [(140, 380), (390, 640), (660, 560), (930, 420), (1200, 330)]
    wobbly_line(d, feel, INK['red'], 6)
    for (x, y) in feel:
        d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=INK['red'])
    write(d, (60, 300), 'happy', HAND(34), INK['green']); write(d, (60, 680), 'annoyed', HAND(34), INK['red'])
    sticky(c, (290, 700), 'Fee only shows at payment!', 'pink')
    sticky(c, (560, 720), 'Slot grid hard to scan', 'pink')
    sticky(c, (860, 720), 'Saved card = fast', 'green')
    photograph(c, 'checkout-journey-map', background=(92, 88, 82))

    # 5. Card sort on a table (Library catalogue search)
    rng = np.random.default_rng(3)
    wood = np.zeros((H, W, 3))
    grain = np.sin(np.linspace(0, 60, W))[None, :] * 10 + rng.normal(0, 6, (H, W))
    wood[..., 0], wood[..., 1], wood[..., 2] = 150 + grain, 104 + grain * 0.8, 66 + grain * 0.5
    c = Image.fromarray(np.clip(wood, 0, 255).astype(np.uint8)).convert('RGBA'); d = ImageDraw.Draw(c)
    groups = [('AVAILABLE NOW', ['On the shelf', 'Ready today', 'Branch nearby']), ('WHAT IT\'S ABOUT', ['Lighthouse story', 'Girl & bird cover', 'Sea, family']),
              ('FORMAT', ['E-book', 'Audiobook', 'Large print'])]
    for g, (title, cards) in enumerate(groups):
        x = 90 + g * 430
        sticky(c, (x, 60), title, 'orange', size=(300, 110), angle=random.uniform(-3, 3))
        for i, card in enumerate(cards):
            note = Image.new('RGBA', (320, 170), (0, 0, 0, 0)); nd = ImageDraw.Draw(note)
            nd.rectangle([10, 10, 300, 150], fill=(252, 251, 246, 255), outline=(210, 206, 196, 255))
            write(nd, (28, 42), card, HAND(42), INK['black'])
            note = note.rotate(random.uniform(-6, 6), resample=Image.BICUBIC, expand=True)
            c.alpha_composite(note, (x + random.randint(-10, 20), 230 + i * 210))
    photograph(c, 'library-card-sort', background=(54, 40, 30))

    # 6. Decision sketch on dot-grid paper
    c = surface('dotgrid'); d = ImageDraw.Draw(c)
    write(d, (80, 40), 'DECIDED: preparation screen (2 Sept)', MARKER(46), INK['green'])
    phone(d, (120, 140, 470, 860), INK['black'], 'Before you start', ['You\'ll need:', '- photo ID', '- proof of address', '  (bill, statement or letter)', 'button'])
    arrow(d, (560, 300), (470, 330), INK['blue'])
    write(d, (580, 260), 'list accepted documents with examples', HAND(42), INK['blue'], max_width=640)
    arrow(d, (560, 650), (470, 760), INK['blue'])
    write(d, (580, 610), '"Start" only after this screen', HAND(42), INK['blue'], max_width=640)
    write(d, (580, 800), 'backed by 4 observations, 2 findings', HAND(40), INK['red'], max_width=640)
    photograph(c, 'banking-decision-sketch', background=(78, 82, 88))

    # 7. Diary study pages (Grocery checkout)
    c = surface('notebook'); d = ImageDraw.Draw(c)
    write(d, (150, 60), 'Diary review: weekly shop', MARKER(44), INK['blue'])
    for i, (who, text) in enumerate([('P-05, Tue', 'Booked Thursday 6-7pm again. Same as always after my shift.'),
                                     ('P-11, Wed', 'Picked the same slot. Wish it remembered it.'),
                                     ('P-06, Sun', 'Rebuilt my usual basket from scratch... again.')]):
        y = 170 + i * 260
        write(d, (150, y), who, HAND(46), INK['red'])
        write(d, (150, y + 60), text, HAND(42), INK['black'], max_width=1100)
    write(d, (900, 880), '-> same slot every week?', HAND(44), INK['green'])
    photograph(c, 'checkout-diary-pages', background=(84, 76, 70))

    # 8. Mind map on a whiteboard (Library catalogue search)
    c = surface('whiteboard'); d = ImageDraw.Draw(c)
    loop(d, (520, 400, 880, 560), INK['blue'], 6)
    write(d, (548, 450), 'How patrons remember a book', MARKER(34), INK['blue'], max_width=320)
    for (x, y, text, colour) in [(120, 140, 'the plot ("lighthouse keeper\'s daughter")', 'black'), (900, 130, 'the cover: green, a bird', 'green'),
                                 (100, 720, 'author name, misspelled', 'red'), (940, 700, '"I\'d just ask a librarian"', 'black')]:
        write(d, (x, y), text, HAND(42), INK[colour], max_width=380)
        arrow(d, (700, 480), (x + 160, y + (90 if y < 400 else -20)), INK[colour], 4)
    write(d, (60, 40), 'Catalogue search: interviews 1-2', MARKER(46), INK['black'])
    photograph(c, 'library-mind-map', background=(96, 92, 86))


if __name__ == '__main__':
    main()
