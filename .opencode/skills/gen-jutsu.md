---
name: gen-jutsu
description: "Gen Jutsu — effetti particellari, shader, illusioni visive, nebbia, fumo, fiamme, distorsioni, animazioni psichedeliche, astratte, generative. WebGL, GLSL shader, GPU particles, post-processing, creative coding. Triggers: 'gen jutsu', 'genjutsu', 'particelle', 'shader', 'glsl', 'effetti visivi', 'illusioni', 'nebbia', 'fumo', 'fiamme', 'distorsione', 'psichedelico', 'astratto', 'generative art', 'particellare', 'post-processing', 'webgl effects', 'creative coding'."
---
# Gen Jutsu — Effetti Visivi, Shader, Particelle

Skill per effetti visivi avanzati con shader GLSL, sistemi particellari, post-processing e creative coding in WebGL.

## Categorie di effetti

### Nebbia, Fumo, Fiamme (volumetrici)
- Simulazione di volumi con noise 3D (Perlin/Simplex) in fragment shader
- Ray marching per nebbia volumetrica
- Fumo con FBM (Fractional Brownian Motion)
- Fiamme con curve di temperatura (palette caldo→bianco)

### Distorsioni e Illusioni
- Displacement map su UV per distorcere immagini
- Effetto "glitch" con shift di canali RGB + rumore
- Effetto "mirage" / heat haze con noise temporal
- Effetto "kaleidoscope" con simmetrie radiali
- Effetto "tunnel" con coordinate polari

### Sistemi particellari
- Points (THREE.Points / BufferGeometry)
- GPGPU per particelle (calcolo posizione su GPU)
- Attrazione / repulsione / gravity wells
- Trail particles (scia con fading)
- Particle texture atlas

### Psichedelico / Astratto
- Feedback loop (render target → texture → ri-render)
- Color cycling con palette HSB
- Warp / morph con noise field
- Pattern di reazione-diffusione
- Mandelbrot / Julia set animati
- Wave interference patterns

### Glitch e distorsioni digitali
- Chromatic aberration
- Scanlines / CRT
- Pixel sorting
- Data moshing simulato
- RGB split

## Stack consigliato

| Effetto | Tool |
|---------|------|
| Shader puri | GLSL in ShaderMaterial (Three.js) |
| Post-processing | @react-three/postprocessing / drei Effects |
| Particelle | THREE.Points + BufferGeometry |
| GPGPU | Three.js DataTexture + compute shader |
| SDF/Volumi | Ray marching in fragment shader |
| Noise | glsl-noise / custom simplex 3D |
| Creative coding | p5.js / regl / canvas 2D |

## Template shader base

```glsl
// Fragment shader con tempo e mouse
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uMouse;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  // ...effetto...
  gl_FragColor = vec4(color, 1.0);
}
```

## Performance

- Shader: preferisci calcoli in vertex shader se possibile (fragment è per-pixel)
- Particelle: usa InstancedMesh per < 10k, GPU points per > 10k
- Post-processing: un singolo pass complesso > due pass semplici
- Mobile: riduci risoluzione effetti, evita ray marching
- WebGL2: usa trasform feedback per particle update GPU-side

## Ispirazione

- Shadertoy (shader)
- The Book of Shaders (tutorial GLSL)
- Inigo Quilez (articoli SDF/ray marching)
- Three.js examples (particles, post-processing)
- p5.js creative coding examples
