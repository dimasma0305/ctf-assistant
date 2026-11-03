"""Regression checks for template preservation and readable caption fitting."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageChops

spec = importlib.util.spec_from_file_location(
    'caption', Path(__file__).parent / 'skills/local/meme-craft/scripts/caption.py')
caption = importlib.util.module_from_spec(spec)
spec.loader.exec_module(caption)


class CaptionTests(unittest.TestCase):
    def test_edit_preserves_template_pixels_outside_caption_box(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'original.png', Path(directory) / 'meme.png'
            original = Image.new('RGBA', (320, 200), (25, 85, 135, 255))
            original.save(source)
            caption.render(source, {'boxes': [{'text': 'BANG UDAH\nSAMPE MANA?',
                'box': [20, 15, 180, 90], 'min_font': 14, 'max_font': 24, 'angle': 11}]}, output)
            with Image.open(output) as rendered:
                changed = ImageChops.difference(original.convert('RGB'), rendered.convert('RGB')).getbbox()
                self.assertIsNotNone(changed)
                self.assertGreaterEqual(changed[0], 20)
                self.assertGreaterEqual(changed[1], 15)
                self.assertLessEqual(changed[2], 200)
                self.assertLessEqual(changed[3], 105)
                self.assertEqual(rendered.size, original.size)
            self.assertEqual(Image.open(source).tobytes(), original.tobytes())

    def test_rejects_unreadable_caption_and_invalid_box_without_export(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'original.png', Path(directory) / 'meme.png'
            Image.new('RGB', (320, 200), 'white').save(source)
            cases = [
                {'text': 'an-impossibly-long-word-' * 20, 'box': [5, 5, 40, 25]},
                {'text': 'too many words ' * 20, 'box': [5, 5, 40, 25]},
                {'text': 'oops', 'box': [300, 190, 100, 80]},
            ]
            for box in cases:
                with self.assertRaises(ValueError):
                    caption.render(source, {'boxes': [box]}, output)
                self.assertFalse(output.exists())

    def test_does_not_silently_flatten_animation_or_overwrite_original(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'animated.gif', Path(directory) / 'meme.png'
            Image.new('RGB', (100, 100), 'red').save(source, save_all=True,
                append_images=[Image.new('RGB', (100, 100), 'blue')], duration=100, loop=0)
            layout = {'boxes': [{'text': 'test', 'box': [0, 0, 100, 100]}]}
            with self.assertRaisesRegex(ValueError, 'Animated'):
                caption.render(source, layout, output)
            Image.new('RGB', (100, 100), 'red').save(output)
            with self.assertRaisesRegex(ValueError, 'original'):
                caption.render(output, layout, output)

    def test_caption_band_preserves_entire_original_image_and_alpha(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'original.png', Path(directory) / 'meme.png'
            original = Image.new('RGBA', (320, 200), (25, 85, 135, 180))
            original.save(source)
            caption.render(source, {'padding': {'top': 70, 'bottom': 10},
                'boxes': [{'text': 'bos: ide saya gimana?', 'box': [10, 5, 300, 60],
                           'fill': 'black', 'stroke_width': 0}]}, output)
            with Image.open(output) as rendered:
                self.assertEqual(rendered.size, (320, 280))
                self.assertEqual(rendered.crop((0, 70, 320, 270)).tobytes(), original.tobytes())
                self.assertEqual(rendered.getpixel((0, 279)), (255, 255, 255, 255))

    def test_gif_retains_motion_timing_loop_and_transparency_with_caption_on_each_frame(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'original.gif', Path(directory) / 'meme.gif'
            frames = []
            for x in (10, 40, 70):
                frame = Image.new('RGBA', (120, 80), (0, 0, 0, 0))
                frame.paste((255, 0, 0, 255), (x, 20, x + 20, 40))
                frames.append(frame)
            frames[0].save(source, save_all=True, append_images=frames[1:], duration=[70, 120, 220], loop=2, disposal=2)
            original_bytes = source.read_bytes()
            caption.render(source, {'padding': {'top': 40},
                'boxes': [{'text': 'gas dulu', 'box': [2, 2, 116, 36],
                           'min_font': 12, 'max_font': 18, 'fill': 'black', 'stroke_width': 0}]}, output)
            with Image.open(output) as rendered:
                self.assertEqual(rendered.n_frames, 3)
                self.assertEqual(rendered.info['loop'], 2)
                durations = []
                for index, x in enumerate((10, 40, 70)):
                    rendered.seek(index)
                    durations.append(rendered.info['duration'])
                    pixels = rendered.convert('RGBA')
                    self.assertEqual(pixels.getpixel((x + 5, 65)), (255, 0, 0, 255))
                    self.assertEqual(pixels.getpixel((115, 115))[3], 0)
                    if index:
                        self.assertEqual(pixels.getpixel((15, 65))[3], 0)
                    band = pixels.crop((0, 0, 120, 40)).convert('RGB')
                    self.assertIsNotNone(ImageChops.difference(band, Image.new('RGB', band.size, 'white')).getbbox())
                self.assertEqual(durations, [70, 120, 220])
            self.assertEqual(source.read_bytes(), original_bytes)


if __name__ == '__main__':
    unittest.main()
