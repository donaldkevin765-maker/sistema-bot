def build_canvas_webgl_script(canvas_seed: str) -> str:
    return f"""
(() => {{
    const SEED = {hash(canvas_seed) & 0x7FFFFFFF};

    function seededNoise() {{
        let s = SEED;
        return function() {{
            s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
            return ((s >>> 0) / 0xFFFFFFFF) * 2 - 1;
        }};
    }}

    const noise = seededNoise();

    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {{
        if (!this._noised) {{
            this._noised = true;
            return origToDataURL.call(this, type, quality);
        }}
        const ctx = this.getContext('2d');
        if (!ctx) return origToDataURL.call(this, type, quality);
        const w = this.width, h = this.height;
        if (!w || !h) return origToDataURL.call(this, type, quality);
        const imageData = ctx.getImageData(0, 0, w, h);
        const pixels = imageData.data;
        for (let i = 0; i < pixels.length; i += 4) {{
            pixels[i] = Math.max(0, Math.min(255, pixels[i] + noise() * 0.5));
            pixels[i+1] = Math.max(0, Math.min(255, pixels[i+1] + noise() * 0.5));
            pixels[i+2] = Math.max(0, Math.min(255, pixels[i+2] + noise() * 0.5));
        }}
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w; tempCanvas.height = h;
        tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
        return tempCanvas.toDataURL(type, quality);
    }};

    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {{
        const dataUrl = this.toDataURL(type, quality);
        const binary = atob(dataUrl.split(',')[1]);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        callback(new Blob([array], {{type: type || 'image/png'}}));
    }};

    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {{
        const imageData = origGetImageData.call(this, x, y, w, h);
        const pixels = imageData.data;
        for (let i = 0; i < pixels.length; i += 4) {{
            pixels[i] = Math.max(0, Math.min(255, pixels[i] + noise() * 0.3));
            pixels[i+1] = Math.max(0, Math.min(255, pixels[i+1] + noise() * 0.3));
            pixels[i+2] = Math.max(0, Math.min(255, pixels[i+2] + noise() * 0.3));
        }}
        return imageData;
    }};

    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, attrs) {{
        const ctx = origGetContext.call(this, type, attrs);
        if (!ctx || type !== '2d') return ctx;
        const origFillText = ctx.fillText;
        ctx.fillText = function(text, x, y, maxWidth) {{
            return origFillText.call(this, text, x + noise() * 0.2, y + noise() * 0.2, maxWidth);
        }};
        const origStrokeText = ctx.strokeText;
        ctx.strokeText = function(text, x, y, maxWidth) {{
            return origStrokeText.call(this, text, x + noise() * 0.2, y + noise() * 0.2, maxWidth);
        }};
        return ctx;
    }};

    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    if (origGetParameter) {{
        WebGLRenderingContext.prototype.getParameter = function(pname) {{
            const result = origGetParameter.call(this, pname);
            switch (pname) {{
                case 37445:
                    return 'WebKit WebGL';
                case 37446:
                    return 'WebKit WebGL ' + (SEED % 1000);
                case 7936:
                case 7937:
                case 7938:
                    if (typeof result === 'string') {{
                        return result + ' (ANGLE ' + (SEED % 100) + ')';
                    }}
                    return result;
                case 35725:
                    return null;
                case 36348:
                case 36349:
                    if (result && typeof result.getExtension === 'function') {{
                        return result;
                    }}
                    return result;
                default:
                    return result;
            }}
        }};
    }}

    const origGetSupportedExtensions = WebGLRenderingContext.prototype.getSupportedExtensions;
    if (origGetSupportedExtensions) {{
        WebGLRenderingContext.prototype.getSupportedExtensions = function() {{
            const exts = origGetSupportedExtensions.call(this) || [];
            const blacklist = ['WEBGL_debug_renderer_info', 'WEBGL_debug_shaders'];
            return exts.filter(e => !blacklist.includes(e));
        }};
    }}

    const origGetExtension = WebGLRenderingContext.prototype.getExtension;
    if (origGetExtension) {{
        WebGLRenderingContext.prototype.getExtension = function(name) {{
            if (name === 'WEBGL_debug_renderer_info') return null;
            if (name === 'WEBGL_debug_shaders') return null;
            return origGetExtension.call(this, name);
        }};
    }}

    if (HTMLCanvasElement.prototype.getContext) {{
        const origWebGLGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, attrs) {{
            if (type === 'webgl' || type === 'experimental-webgl') {{
                attrs = attrs || {{}};
                attrs.powerPreference = 'low-power';
                attrs.failIfMajorPerformanceCaveat = true;
            }}
            return origWebGLGetContext.call(this, type, attrs);
        }};
    }}
}})();
"""
