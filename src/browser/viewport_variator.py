from __future__ import annotations

import random


class ViewportVariator:
    def __init__(self, base_width: int = 412, base_height: int = 915):
        self.base_width = base_width
        self.base_height = base_height

    def generate_viewport(self, seed: int = 0) -> dict:
        rng = random.Random(seed)
        width_offset = rng.randint(-3, 3)
        height_offset = rng.randint(-3, 3)

        width = self.base_width + width_offset
        height = self.base_height + height_offset

        return {
            "width": width,
            "height": height,
            "device_scale_factor": rng.choice([2.0, 2.0, 2.0, 2.25, 2.5, 2.75, 3.0]),
            "is_mobile": True,
            "has_touch": True,
            "screen_width": width,
            "screen_height": height + rng.choice([48, 56, 64, 72]),
            "screen_avail_width": width,
            "screen_avail_height": height - rng.choice([48, 56, 64]),
        }

    def generate_viewport_script(self, seed: int = 0) -> str:
        vp = self.generate_viewport(seed)

        return f"""
(() => {{
    Object.defineProperty(window, 'innerWidth', {{ get: () => {vp['width']} }});
    Object.defineProperty(window, 'innerHeight', {{ get: () => {vp['height']} }});
    Object.defineProperty(window, 'outerWidth', {{ get: () => {vp['width']} }});
    Object.defineProperty(window, 'outerHeight', {{ get: () => {vp['height']} }});
    Object.defineProperty(screen, 'width', {{ get: () => {vp['screen_width']} }});
    Object.defineProperty(screen, 'height', {{ get: () => {vp['screen_height']} }});
    Object.defineProperty(screen, 'availWidth', {{ get: () => {vp['screen_avail_width']} }});
    Object.defineProperty(screen, 'availHeight', {{ get: () => {vp['screen_avail_height']} }});
    Object.defineProperty(screen, 'colorDepth', {{ get: () => 24 }});
    Object.defineProperty(screen, 'pixelDepth', {{ get: () => 24 }});
    Object.defineProperty(window, 'devicePixelRatio', {{ get: () => {vp['device_scale_factor']} }});
}})();
"""
