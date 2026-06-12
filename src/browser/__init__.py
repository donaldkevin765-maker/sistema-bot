from src.browser.font_spoofer import FontSpoofer
from src.browser.viewport_variator import ViewportVariator
from src.browser.touch_events import TouchEventForcer
from src.browser.audio_noise import AudioContextNoiseInjector
from src.browser.canvas_webgl_noise import build_canvas_webgl_script
from src.browser.stealth_amplified import build_full_stealth_script

__all__ = [
    "FontSpoofer", "ViewportVariator", "TouchEventForcer",
    "AudioContextNoiseInjector", "build_canvas_webgl_script",
    "build_full_stealth_script",
]
