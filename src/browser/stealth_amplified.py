from __future__ import annotations

import hashlib
import math
import random


def build_full_stealth_script(canvas_seed: str, bot_id: int) -> str:
    seed_int = int(hashlib.sha256(canvas_seed.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed_int)

    webgl_vendor = rng.choice([
        "Google Inc. (Intel)",
        "Google Inc. (Mesa)",
        "Google Inc. (Qualcomm)",
        "Google Inc. (ARM)",
        "Google Inc. (Apple)",
    ])
    webgl_renderer = rng.choice([
        "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)",
        "ANGLE (Qualcomm, Adreno(TM) 618 Direct3D11 vs_5_0 ps_5_0)",
        "ANGLE (ARM, Mali-G76 Direct3D11 vs_5_0 ps_5_0)",
        "ANGLE (Apple, Apple M1 Direct3D11 vs_5_0 ps_5_0)",
        "WebKit WebGL",
    ])
    webgl_max_texture_size = rng.choice([4096, 8192, 16384])
    webgl_max_vertex_attribs = rng.choice([16, 24, 32])
    webgl_max_combined_textures = rng.choice([64, 128, 256])
    webgl_max_cube_map_size = rng.choice([4096, 8192])
    webgl_max_render_buffer = rng.choice([4096, 8192])
    webgl_max_texture_units = rng.choice([8, 16, 32])
    webgl_max_viewport = rng.choice([8192, 16384])

    battery_level = rng.uniform(0.2, 0.95)
    battery_charging = rng.random() < 0.3
    battery_discharging_time = int(rng.uniform(600, 14400)) if not battery_charging else 0

    mem_js_heap = rng.randint(100, 800) * 1024 * 1024
    mem_total = rng.randint(1500, 4000) * 1024 * 1024
    mem_limit = rng.randint(2000, 4000) * 1024 * 1024

    screen_color_depth = rng.choice([24, 30, 32])
    screen_pixel_depth = screen_color_depth
    screen_avail_left = rng.choice([0, 0, 0, 48, 56])
    screen_top = rng.randint(24, 48)

    device_memory = rng.choice([2, 2, 4, 4, 4, 6, 8])
    hardware_concurrency = rng.choice([4, 4, 4, 6, 8])

    connection_type = rng.choice(["4g", "4g", "4g", "3g"])
    connection_downlink = rng.uniform(2.0, 15.0)
    connection_rtt = rng.randint(30, 150)

    timezone_offset = rng.choice([60, 60, 60, 60, 120, 0, -60])
    timezone_str = rng.choice(["Europe/Rome", "Europe/Rome", "Europe/Madrid", "Europe/Paris", "Europe/Berlin"])

    plugins_count = rng.randint(4, 8)
    speech_voices_count = rng.randint(2, 5)

    amb_light = rng.uniform(50, 500)

    return f"""
(() => {{
    const SEED = {seed_int};
    const BOT_ID = {bot_id};

    function srand() {{
        let s = SEED + BOT_ID;
        return function() {{
            s = (s * 1664525 + 1013904223) & 0x7FFFFFFF;
            return (s >>> 0) / 0x7FFFFFFF;
        }};
    }}

    const rand = srand();

    // ===================================================================
    // 01 - CANVAS NOISE L3 (pattern posizionale)
    // ===================================================================
    (function() {{
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
            try {{
                const imageData = ctx.getImageData(0, 0, w, h);
                const pixels = imageData.data;
                for (let y = 0; y < h; y++) {{
                    for (let x = 0; x < w; x++) {{
                        const i = (y * w + x) * 4;
                        if ((x + y) % 4 === 0) {{
                            const noise = (rand() - 0.5) * 0.6;
                            for (let c = 0; c < 3; c++) {{
                                pixels[i + c] = Math.max(0, Math.min(255, pixels[i + c] + noise));
                            }}
                        }}
                    }}
                }}
                const temp = document.createElement('canvas');
                temp.width = w; temp.height = h;
                temp.getContext('2d').putImageData(imageData, 0, 0);
                return temp.toDataURL(type, quality);
            }} catch(e) {{
                return origToDataURL.call(this, type, quality);
            }}
        }};
    }})();

    // ===================================================================
    // 02-03 - WEBGL VENDOR + PARAMS SPOOFING
    // ===================================================================
    (function() {{
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return;

        const origGetParam = gl.getParameter.bind(gl);
        const WEBGL_PARAMS = {{
            37445: "{webgl_vendor}",
            37446: "{webgl_renderer}",
            3379: {webgl_max_texture_size},
            34921: {webgl_max_vertex_attribs},
            35661: {webgl_max_combined_textures},
            34076: {webgl_max_cube_map_size},
            34024: {webgl_max_render_buffer},
            35660: {webgl_max_texture_units},
            3386: {webgl_max_viewport},
            7936: "WebGL GLSL",
            7937: "WebGL GLSL ES",
            35724: null,
            35725: null,
        }};

        gl.getParameter = function(pname) {{
            if (pname in WEBGL_PARAMS) return WEBGL_PARAMS[pname];
            if (pname === 36348 || pname === 36349) return null;
            return origGetParam(pname);
        }};

        const origGetExt = gl.getExtension.bind(gl);
        gl.getExtension = function(name) {{
            if (name === 'WEBGL_debug_renderer_info') return null;
            if (name === 'WEBGL_debug_shaders') return null;
            return origGetExt(name);
        }};

        const origGetSupportedExts = gl.getSupportedExtensions.bind(gl);
        gl.getSupportedExtensions = function() {{
            const exts = origGetSupportedExts() || [];
            return exts.filter(e => e !== 'WEBGL_debug_renderer_info' && e !== 'WEBGL_debug_shaders');
        }};
    }})();

    // ===================================================================
    // 04 - WEBRTC LEAK PREVENTION
    // ===================================================================
    (function() {{
        const origRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
        if (!origRTCPeerConnection) return;
        window.RTCPeerConnection = function(config) {{
            const fakeConfig = config || {{}};
            fakeConfig.iceServers = [];
            const pc = new origRTCPeerConnection(fakeConfig);
            const origCreateDataChannel = pc.createDataChannel.bind(pc);
            pc.createDataChannel = function() {{ return origCreateDataChannel('fake'); }};
            return pc;
        }};
        window.RTCPeerConnection.prototype = origRTCPeerConnection.prototype;

        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {{
            const origEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
            navigator.mediaDevices.enumerateDevices = async function() {{
                try {{
                    const devices = await origEnum();
                    return devices.filter(d => d.kind !== 'audiooutput');
                }} catch(e) {{
                    return [];
                }}
            }};
        }}
    }})();

    // ===================================================================
    // 05 - BATTERY API SPOOFING
    // ===================================================================
    (function() {{
        if (!navigator.getBattery) return;
        const origGetBattery = navigator.getBattery.bind(navigator);
        navigator.getBattery = async function() {{
            const battery = {{
                charging: {str(battery_charging).lower()},
                chargingTime: 0,
                dischargingTime: {battery_discharging_time},
                level: {battery_level},
                onchargingchange: null,
                onchargingtimechange: null,
                ondischargingtimechange: null,
                onlevelchange: null,
            }};
            return battery;
        }};
    }})();

    // ===================================================================
    // 06 - PERFORMANCE.MEMORY
    // ===================================================================
    (function() {{
        if (performance.memory) {{
            Object.defineProperty(performance, 'memory', {{
                get: () => ({{
                    jsHeapSizeLimit: {mem_limit},
                    totalJSHeapSize: {mem_js_heap},
                    usedJSHeapSize: {mem_js_heap // 2},
                }}),
                configurable: true,
            }});
        }}
    }})();

    // ===================================================================
    // 07 - MEDIADEVICES ENUMERATE
    // ===================================================================
    (function() {{
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {{
            const origEnum = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
            navigator.mediaDevices.enumerateDevices = async function() {{
                const fakeDevices = [
                    {{ deviceId: 'fake-audio-1', kind: 'audioinput', label: 'Microphone (Realtek Audio)', groupId: 'group1' }},
                    {{ deviceId: 'fake-video-1', kind: 'videoinput', label: 'Webcam (HP Wide Vision HD)', groupId: 'group2' }},
                ];
                try {{
                    const real = await origEnum();
                    return [...real, ...fakeDevices];
                }} catch(e) {{
                    return fakeDevices;
                }}
            }};
        }}
    }})();

    // ===================================================================
    // 08 - NAVIGATOR.PLUGINS & MIMETYPES
    // ===================================================================
    (function() {{
        const plugins = {{
            0: {{ name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }},
            1: {{ name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' }},
            2: {{ name: 'Widevine Content Decryption Module', filename: 'widevinecdm', description: 'Enables Widevine encrypted content playback' }},
            3: {{ name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }},
        }};
        const count = {plugins_count};
        const pluginArr = [];
        for (let i = 0; i < Math.min(count, Object.keys(plugins).length); i++) {{
            pluginArr.push(plugins[i]);
        }}
        Object.defineProperty(navigator, 'plugins', {{
            get: () => {{
                const arr = pluginArr;
                arr.item = (i) => arr[i] || null;
                arr.namedItem = (n) => arr.find(p => p.name === n) || null;
                arr.refresh = () => {{}};
                arr.length = arr.length;
                return arr;
            }},
            configurable: true,
        }});

        const mimeTypes = {{
            'application/pdf': {{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }},
            'application/x-google-chrome-pdf': {{ type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' }},
            'application/x-nacl': {{ type: 'application/x-nacl', suffixes: 'nexe', description: 'Native Client Executable' }},
            'application/x-pnacl': {{ type: 'application/x-pnacl', suffixes: 'pexe', description: 'Portable Native Client Executable' }},
        }};
        Object.defineProperty(navigator, 'mimeTypes', {{
            get: () => {{
                const mt = mimeTypes;
                Object.setPrototypeOf(mt, MimeTypeArray.prototype);
                mt.length = Object.keys(mt).length;
                mt.item = (i) => Object.values(mt)[i] || null;
                mt.namedItem = (n) => mt[n] || null;
                return mt;
            }},
            configurable: true,
        }});
    }})();

    // ===================================================================
    // 09 - PERFORMANCE.NOW() NOISE
    // ===================================================================
    (function() {{
        const origNow = performance.now.bind(performance);
        let noiseAccum = 0;
        performance.now = function() {{
            noiseAccum += (rand() - 0.5) * 0.015;
            noiseAccum = Math.max(-5, Math.min(5, noiseAccum));
            return origNow() + noiseAccum;
        }};
    }})();

    // ===================================================================
    // 10 - SCREEN ORIENTATION
    // ===================================================================
    (function() {{
        if (screen.orientation) {{
            const isPortrait = screen.width < screen.height;
            Object.defineProperty(screen, 'orientation', {{
                get: () => ({{
                    type: isPortrait ? 'portrait-primary' : 'landscape-primary',
                    angle: isPortrait ? 0 : 90,
                    onchange: null,
                }}),
                configurable: true,
            }});
        }}
    }})();

    // ===================================================================
    // 11 - NETWORK INFORMATION (NETWORKINFORMATION API)
    // ===================================================================
    (function() {{
        if (navigator.connection) {{
            Object.defineProperty(navigator, 'connection', {{
                get: () => ({{
                    effectiveType: '{connection_type}',
                    downlink: {connection_downlink},
                    downlinkMax: {connection_downlink * 2},
                    rtt: {connection_rtt},
                    type: '{connection_type}',
                    saveData: false,
                    onchange: null,
                }}),
                configurable: true,
            }});
        }}
    }})();

    // ===================================================================
    // 12 - HARDWARE KEYBOARD + POINTER EVENTS
    // ===================================================================
    (function() {{
        {{navigator.hardwareKeyboard !== undefined && Object.defineProperty(navigator, 'hardwareKeyboard', {{
            get: () => ({{}}),
            configurable: true,
        }})}}
        if (window.PointerEvent) {{
            const origPointer = PointerEvent.prototype;
            Object.defineProperty(PointerEvent.prototype, 'pointerType', {{
                get: () => 'touch',
                configurable: true,
            }});
        }}
    }})();

    // ===================================================================
    // 13 - SCREEN PROPERTIES
    // ===================================================================
    (function() {{
        Object.defineProperty(screen, 'colorDepth', {{ get: () => {screen_color_depth}, configurable: true }});
        Object.defineProperty(screen, 'pixelDepth', {{ get: () => {screen_pixel_depth}, configurable: true }});
        Object.defineProperty(screen, 'availLeft', {{ get: () => {screen_avail_left}, configurable: true }});
        Object.defineProperty(screen, 'availTop', {{ get: () => {screen_top}, configurable: true }});
    }})();

    // ===================================================================
    // 14 - DEVICE MEMORY + HARDWARE CONCURRENCY
    // ===================================================================
    (function() {{
        Object.defineProperty(navigator, 'deviceMemory', {{ get: () => {device_memory}, configurable: true }});
        Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {hardware_concurrency}, configurable: true }});
    }})();

    // ===================================================================
    // 15 - GEOLOCATION SPOOFING
    // ===================================================================
    (function() {{
        if (navigator.geolocation) {{
            const lat = {rng.uniform(36.0, 47.0):.4f};
            const lng = {rng.uniform(6.0, 18.0):.4f};
            const acc = {rng.uniform(20, 100):.1f};
            navigator.geolocation.getCurrentPosition = function(success, error, opts) {{
                setTimeout(() => {{
                    success({{
                        coords: {{
                            latitude: lat, longitude: lng,
                            accuracy: acc, altitude: null, altitudeAccuracy: null,
                            heading: null, speed: null,
                        }},
                        timestamp: Date.now(),
                    }});
                }}, rand() * 500 + 100);
            }};
            navigator.geolocation.watchPosition = function(success, error, opts) {{
                navigator.geolocation.getCurrentPosition(success, error, opts);
                return 0;
            }};
        }}
    }})();

    // ===================================================================
    // 16 - SPEECHSYNTHESIS VOICES
    // ===================================================================
    (function() {{
        if (window.speechSynthesis) {{
            const origGetVoices = window.speechSynthesis.getVoices.bind(window.speechSynthesis);
            window.speechSynthesis.getVoices = function() {{
                const voices = [
                    {{ name: 'Google Italiano', lang: 'it-IT', default: true, localService: true, voiceURI: 'Google Italiano' }},
                    {{ name: 'Google English (US)', lang: 'en-US', default: false, localService: true, voiceURI: 'Google English US' }},
                ];
                while (voices.length < {speech_voices_count}) {{
                    voices.push({{ name: 'Voice ' + voices.length, lang: 'en-US', default: false, localService: true, voiceURI: 'voice_' + voices.length }});
                }}
                return voices;
            }};
        }}
    }})();

    // ===================================================================
    // 17 - AMBIENT LIGHT SENSOR
    // ===================================================================
    (function() {{
        if (window.AmbientLightSensor) {{
            class FakeAmbientLightSensor extends EventTarget {{
                constructor() {{
                    super();
                    this.illuminance = {amb_light};
                    setTimeout(() => this.dispatchEvent(new Event('reading')), 50);
                }}
                start() {{}}
                stop() {{}}
            }}
            window.AmbientLightSensor = FakeAmbientLightSensor;
        }}
    }})();

    // ===================================================================
    // 18 - WEBDRIVER REMOVAL
    // ===================================================================
    (function() {{
        Object.defineProperty(navigator, 'webdriver', {{ get: () => undefined, configurable: true }});
        Object.defineProperty(navigator, 'webdriverEvaluate', {{ get: () => undefined, configurable: true }});
        Object.defineProperty(navigator, 'languages', {{ get: () => ['it-IT', 'it', 'en-US', 'en'], configurable: true }});

        const origToString = Function.prototype.toString;
        Function.prototype.toString = function() {{
            if (this === navigator.webdriver) return 'function webdriver() {{}}';
            return origToString.call(this);
        }};

        if (document.documentElement.getAttribute('webdriver') !== null) {{
            document.documentElement.removeAttribute('webdriver');
        }}
    }})();
}})();
"""


def build_amplified_noise_layer2(canvas_seed: str, bot_id: int) -> str:
    return build_full_stealth_script(canvas_seed, bot_id)
