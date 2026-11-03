#!/usr/bin/env python3
"""Caption an existing local image/GIF, optionally with text bands. No network."""
import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

Image.MAX_IMAGE_PIXELS = 20_000_000
DEFAULT_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
MAX_FRAMES = 200
MAX_DECODED_PIXELS = 80_000_000


def wrap(text, draw, font, width, stroke):
    lines = []
    for paragraph in text.split('\n'):
        line = ''
        for word in paragraph.split():
            trial = f'{line} {word}'.strip()
            if draw.textbbox((0, 0), trial, font=font, stroke_width=stroke)[2] > width:
                if not line:
                    return None
                lines.append(line)
                line = word
            else:
                line = trial
        lines.append(line)
    return '\n'.join(lines)


def caption_layer(spec, width, height, font_path):
    text = spec.get('text')
    if not isinstance(text, str) or not text.strip() or len(text) > 1000:
        raise ValueError('Caption must contain 1..1000 characters')
    small, large = int(spec.get('min_font', 18)), int(spec.get('max_font', 64))
    stroke = int(spec.get('stroke_width', 2))
    angle = float(spec.get('angle', 0))
    if not 8 <= small <= large <= 300 or not 0 <= stroke <= 12 or not math.isfinite(angle) or abs(angle) > 45:
        raise ValueError('Invalid font range, stroke, or angle')
    draw = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    for size in range(large, small - 1, -1):
        font = ImageFont.truetype(font_path, size)
        spacing = max(2, size // 8)
        wrapped = wrap(text, draw, font, width - 4, stroke)
        if wrapped is None:
            continue
        left, top, right, bottom = draw.multiline_textbbox(
            (0, 0), wrapped, font=font, spacing=spacing, align='center', stroke_width=stroke)
        if right - left + 4 > width or bottom - top + 4 > height:
            continue
        layer = Image.new('RGBA', (math.ceil(right - left + 4), math.ceil(bottom - top + 4)))
        ImageDraw.Draw(layer).multiline_text(
            (2 - left, 2 - top), wrapped, font=font, spacing=spacing, align='center',
            fill=spec.get('fill', 'white'), stroke_width=stroke,
            stroke_fill=spec.get('stroke', 'black'))
        if angle:
            layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        if layer.width <= width and layer.height <= height:
            return layer
    raise ValueError('Caption does not fit at min_font; shorten it or enlarge its box')


def render(template, layout, output, font_path=DEFAULT_FONT):
    if not isinstance(layout, dict):
        raise ValueError('Layout must be an object')
    boxes = layout.get('boxes')
    if not isinstance(boxes, list) or not 1 <= len(boxes) <= 12:
        raise ValueError('Provide 1..12 caption boxes')
    extension = Path(output).suffix.lower()
    if extension not in ('.png', '.gif'):
        raise ValueError('Output must be a PNG or GIF')
    if Path(template).resolve() == Path(output).resolve():
        raise ValueError('Keep the original template; use a different output path')
    padding = layout.get('padding', {})
    if not isinstance(padding, dict):
        raise ValueError('padding must be an object')
    top, bottom = padding.get('top', 0), padding.get('bottom', 0)
    if any(type(value) is not int or not 0 <= value <= 1200 for value in (top, bottom)):
        raise ValueError('Padding must be 0..1200 integer pixels')
    frames, durations = [], []
    with Image.open(template) as source:
        count = getattr(source, 'n_frames', 1)
        if count > 1 and extension != '.gif':
            raise ValueError('Animated templates require GIF output; refusing to drop frames')
        if count > MAX_FRAMES:
            raise ValueError('Animation exceeds 200 frames; trim it deliberately first')
        if source.width * source.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError('Template exceeds 20 megapixels')
        loop = source.info.get('loop')
        for index in range(count):
            source.seek(index)
            frame = ImageOps.exif_transpose(source).convert('RGBA')
            width, height = frame.width, frame.height + top + bottom
            if width * height > Image.MAX_IMAGE_PIXELS or width * height * count > MAX_DECODED_PIXELS:
                raise ValueError('Decoded animation/canvas too large; resize or trim it first')
            canvas = Image.new('RGBA', (width, height), padding.get('color', 'white'))
            # Unmasked paste retains the original alpha, including transparent
            # GIF areas. Only the added bands receive the padding color.
            canvas.paste(frame, (0, top))
            frames.append(canvas)
            durations.append(source.info.get('duration', 100))
    canvas = frames[0]
    for spec in boxes:
        box = spec.get('box') if isinstance(spec, dict) else None
        if not isinstance(box, list) or len(box) != 4 or any(type(v) is not int for v in box):
            raise ValueError('box must be integer pixels [x,y,width,height]')
        x, y, width, height = box
        if min(x, y) < 0 or min(width, height) < 1 or x + width > canvas.width or y + height > canvas.height:
            raise ValueError('Caption box is outside the template')
        layer = caption_layer(spec, width, height, font_path)
        position = (x + (width - layer.width) // 2, y + (height - layer.height) // 2)
        for frame in frames:
            frame.alpha_composite(layer, position)
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    if extension == '.gif':
        encoded = []
        for frame in frames:
            # Reserve one palette entry for transparency on every full frame;
            # disposal=2 prevents stale pixels from trailing moving characters.
            paletted = frame.convert('RGB').quantize(colors=255)
            palette = paletted.getpalette() or []
            paletted.putpalette((palette + [0] * 768)[:768])
            paletted.paste(255, mask=frame.getchannel('A').point(lambda alpha: 255 if alpha < 128 else 0))
            encoded.append(paletted)
        encoded[0].save(output, save_all=True, append_images=encoded[1:], duration=durations,
                        disposal=2, transparency=255, optimize=False,
                        **({'loop': loop} if loop is not None else {}))
    else:
        canvas.save(output, optimize=True)
    with Image.open(output) as check:
        saved_frames = getattr(check, 'n_frames', 1)
        check.verify()
    return {'file': str(output), 'width': canvas.width, 'height': canvas.height,
            'bytes': Path(output).stat().st_size, 'captions': len(boxes),
            'frames': saved_frames, **({'duration_ms': sum(durations)} if extension == '.gif' else {})}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('template', type=Path)
    parser.add_argument('layout', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--font', default=DEFAULT_FONT)
    args = parser.parse_args()
    try:
        result = render(args.template, json.loads(args.layout.read_text()), args.output, args.font)
    except (ValueError, OSError) as error:
        parser.exit(1, f'{error}\n')
    print(json.dumps(result))
