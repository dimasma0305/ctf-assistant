#!/usr/bin/env python3
"""Place fitted literal captions on an existing local meme template. No network."""
import argparse
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

Image.MAX_IMAGE_PIXELS = 20_000_000
DEFAULT_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'


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
    boxes = layout.get('boxes')
    if not isinstance(boxes, list) or not 1 <= len(boxes) <= 12:
        raise ValueError('Provide 1..12 caption boxes')
    if Path(output).suffix.lower() != '.png':
        raise ValueError('Output must be a PNG')
    if Path(template).resolve() == Path(output).resolve():
        raise ValueError('Keep the original template; use a different output path')
    with Image.open(template) as source:
        if getattr(source, 'n_frames', 1) != 1:
            raise ValueError('Animated templates need a frame-aware renderer')
        if source.width * source.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError('Template exceeds 20 megapixels')
        canvas = ImageOps.exif_transpose(source).convert('RGBA')
    for spec in boxes:
        box = spec.get('box') if isinstance(spec, dict) else None
        if not isinstance(box, list) or len(box) != 4 or any(type(v) is not int for v in box):
            raise ValueError('box must be integer pixels [x,y,width,height]')
        x, y, width, height = box
        if min(x, y) < 0 or min(width, height) < 1 or x + width > canvas.width or y + height > canvas.height:
            raise ValueError('Caption box is outside the template')
        layer = caption_layer(spec, width, height, font_path)
        canvas.alpha_composite(layer, (x + (width - layer.width) // 2, y + (height - layer.height) // 2))
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)
    with Image.open(output) as check:
        check.verify()
    return {'file': str(output), 'width': canvas.width, 'height': canvas.height,
            'bytes': Path(output).stat().st_size, 'captions': len(boxes)}


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
