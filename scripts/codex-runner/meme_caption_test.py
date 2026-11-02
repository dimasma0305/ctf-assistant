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


if __name__ == '__main__':
    unittest.main()
