from __future__ import annotations

import hashlib


class AudioContextNoiseInjector:
    def __init__(self, seed: int = 0):
        self.seed = seed

    def generate_init_script(self, canvas_seed: str) -> str:
        seed_int = int(hashlib.sha256(canvas_seed.encode()).hexdigest()[:8], 16)
        noise_amplitude = (seed_int % 100) / 100000.0 + 0.0001

        return f"""
(() => {{
    const SEED = {seed_int};
    const NOISE_AMP = {noise_amplitude};

    function seededNoise() {{
        let s = SEED;
        return function() {{
            s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
            return ((s >>> 0) / 0xFFFFFFFF) * 2 - 1;
        }};
    }}

    const noise = seededNoise();

    const OrigAudioContext = window.AudioContext || window.webkitAudioContext;
    if (!OrigAudioContext) return;

    const OrigCreateBuffer = OrigAudioContext.prototype.createBuffer;
    OrigAudioContext.prototype.createBuffer = function(numChannels, length, sampleRate) {{
        const buffer = OrigCreateBuffer.call(this, numChannels, length, sampleRate);
        return buffer;
    }};

    const OrigGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function(channel) {{
        const data = OrigGetChannelData.call(this, channel);
        const length = data.length;
        const noiseData = new Float32Array(length);
        for (let i = 0; i < length; i++) {{
            noiseData[i] = noise() * NOISE_AMP;
        }}
        for (let i = 0; i < length; i++) {{
            data[i] += noiseData[i] * (1 - (i / length));
        }}
        return data;
    }};

    const OrigCreateOscillator = OrigAudioContext.prototype.createOscillator;
    OrigAudioContext.prototype.createOscillator = function() {{
        const osc = OrigCreateOscillator.call(this);
        const origGetFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
        return osc;
    }};

    const OrigGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = function(array) {{
        OrigGetFloatFrequencyData.call(this, array);
        for (let i = 0; i < array.length; i++) {{
            array[i] += noise() * NOISE_AMP * 10;
        }}
    }};

    const OrigGetByteFrequencyData = AnalyserNode.prototype.getByteFrequencyData;
    AnalyserNode.prototype.getByteFrequencyData = function(array) {{
        OrigGetByteFrequencyData.call(this, array);
        for (let i = 0; i < array.length; i++) {{
            array[i] = Math.max(0, Math.min(255, array[i] + Math.round(noise() * NOISE_AMP * 50)));
        }}
    }};

    const OrigCreateScriptProcessor = OrigAudioContext.prototype.createScriptProcessor;
    if (OrigCreateScriptProcessor) {{
        OrigAudioContext.prototype.createScriptProcessor = function(bufferSize, inputChannels, outputChannels) {{
            const processor = OrigCreateScriptProcessor.call(this, bufferSize, inputChannels, outputChannels);
            const origOnAudioProcess = processor.onaudioprocess;
            processor.onaudioprocess = function(event) {{
                const input = event.inputBuffer;
                const output = event.outputBuffer;
                for (let ch = 0; ch < output.numberOfChannels; ch++) {{
                    const inputData = input.getChannelData(ch);
                    const outputData = output.getChannelData(ch);
                    for (let i = 0; i < outputData.length; i++) {{
                        outputData[i] = inputData[i] + noise() * NOISE_AMP;
                    }}
                }}
                if (origOnAudioProcess) {{
                    origOnAudioProcess.call(processor, event);
                }}
            }};
            return processor;
        }};
    }}
}})();
"""
