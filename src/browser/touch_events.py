from __future__ import annotations

import random


class TouchEventForcer:
    def __init__(self, seed: int = 0):
        self._rng = random.Random(seed)

    def generate_init_script(self) -> str:
        return """
(() => {
    const origDefineProperty = Object.defineProperty;
    const origDispatchEvent = EventTarget.prototype.dispatchEvent;

    if ('ontouchstart' in window) {
        return;
    }

    var touchSupported = true;
    var maxTouchPoints = 5;

    origDefineProperty(navigator, 'maxTouchPoints', {
        get: function() { return maxTouchPoints; },
        configurable: true
    });

    origDefineProperty(navigator, 'touchEvents', {
        get: function() { return ['touchstart', 'touchmove', 'touchend', 'touchcancel']; },
        configurable: true
    });

    if (!('ontouchstart' in window)) {
        origDefineProperty(window, 'ontouchstart', {
            get: function() { return null; },
            configurable: true
        });
    }

    var originalListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'click' || type === 'mousedown' || type === 'mouseup' || type === 'mousemove') {
            return;
        }
        return originalListener.call(this, type, listener, options);
    };

    EventTarget.prototype.dispatchEvent = function(event) {
        if (event.type === 'click' || event.type === 'mousedown' || event.type === 'mouseup') {
            return true;
        }
        return origDispatchEvent.call(this, event);
    };
})();
"""

    def generate_touch_action_script(
        self,
        target_x: int,
        target_y: int,
        duration_ms: int = 200,
    ) -> str:
        return f"""
(async () => {{
    const touchStart = new Touch({{
        identifier: Date.now(),
        target: document.elementFromPoint({target_x}, {target_y}),
        clientX: {target_x},
        clientY: {target_y},
        screenX: {target_x},
        screenY: {target_y},
        pageX: {target_x},
        pageY: {target_y},
        radiusX: {self._rng.uniform(5, 15):.1f},
        radiusY: {self._rng.uniform(5, 15):.1f},
        rotationAngle: {self._rng.uniform(0, 360):.1f},
        force: {self._rng.uniform(0.3, 1.0):.2f},
    }});

    const touchStartEvent = new TouchEvent('touchstart', {{
        cancelable: true,
        bubbles: true,
        touches: [touchStart],
        targetTouches: [touchStart],
        changedTouches: [touchStart],
    }});

    const target = document.elementFromPoint({target_x}, {target_y});
    if (target) {{
        target.dispatchEvent(touchStartEvent);
    }}

    await new Promise(r => setTimeout(r, {duration_ms}));

    const touchEnd = new Touch({{
        identifier: touchStart.identifier,
        target: document.elementFromPoint({target_x}, {target_y}),
        clientX: {target_x},
        clientY: {target_y},
        screenX: {target_x},
        screenY: {target_y},
        pageX: {target_x},
        pageY: {target_y},
        radiusX: touchStart.radiusX,
        radiusY: touchStart.radiusY,
        rotationAngle: touchStart.rotationAngle,
        force: 0,
    }});

    const touchEndEvent = new TouchEvent('touchend', {{
        cancelable: true,
        bubbles: true,
        touches: [],
        targetTouches: [],
        changedTouches: [touchEnd],
    }});

    if (target) {{
        target.dispatchEvent(touchEndEvent);
    }}
}})();
"""
