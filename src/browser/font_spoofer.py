from __future__ import annotations

import hashlib
import random


ANDROID_FONTS = [
    "Roboto",
    "Roboto-Medium",
    "Roboto-Light",
    "Roboto-Thin",
    "Roboto-Bold",
    "Roboto-Black",
    "Noto Sans",
    "Noto Sans Arabic",
    "Noto Sans CJK",
    "Noto Sans Hebrew",
    "Noto Sans Thai",
    "Droid Sans Mono",
    "Google Sans",
    "Google Sans Text",
    "Google Sans Display",
    "Product Sans",
    "Arimo",
    "Cousine",
    "Tinos",
]


class FontSpoofer:
    def __init__(self, seed: int = 0):
        self._rng = random.Random(seed)

    def generate_init_script(self, seed: int) -> str:
        rng = random.Random(seed)
        fonts_shuffled = ANDROID_FONTS.copy()
        rng.shuffle(fonts_shuffled)
        fonts_json = str(fonts_shuffled[:rng.randint(8, 15)])

        return f"""
(() => {{
    const FONTS = {fonts_json};

    const origFontCheck = document.fonts.check;
    document.fonts.check = function(font) {{
        const fontName = font.split(' ')[0].replace(/"/g, '');
        if (FONTS.some(f => f.toLowerCase() === fontName.toLowerCase())) {{
            return true;
        }}
        return origFontCheck.call(document.fonts, font);
    }};

    const origGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = function(element, pseudoElt) {{
        const style = origGetComputedStyle.call(this, element, pseudoElt);

        const font = style.getPropertyValue('font-family');
        if (font && font !== '') {{
            const fonts = font.split(',').map(f => f.trim().replace(/"/g, ''));
            const filtered = fonts.filter(f =>
                FONTS.some(af => f.toLowerCase().includes(af.toLowerCase()))
            );
            if (filtered.length > 0) {{
                return style;
            }}
        }}
        return style;
    }};

    if (Element.prototype.measureElement) {{
        const origMeasure = Element.prototype.measureElement;
        Element.prototype.measureElement = function() {{
            return origMeasure.call(this);
        }};
    }}
}})();
"""

    def get_limited_fonts(self) -> list[str]:
        return ANDROID_FONTS.copy()
