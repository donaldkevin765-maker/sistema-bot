---
name: three-d
description: "Three.js — grafica 3D, WebGL, animazioni tridimensionali, rendering, scene, geometrie, materiali, shader, GLTF, fisica 3D. Triggers: 'three.js', 'threejs', '3d', 'webgl', 'animazione 3d', 'rendering 3d', 'scena 3d', 'mesh', 'geometria', 'shader', 'gltf', 'r3f', 'react three fiber'."
---
# Three.js — Grafica 3D

Skill per sviluppo 3D con Three.js e React Three Fiber (R3F) nel contesto di Next.js e app web.

## Setup Base

```typescript
import * as THREE from 'three'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
```

## Pattern principali

- Scene setup: Canvas, camera, renderer, lighting
- Geometrie: Box, Sphere, Plane, custom BufferGeometry
- Materiali: MeshStandardMaterial, MeshPhysicalMaterial, ShaderMaterial
- Animazioni: useFrame, lerp, mixamo, skeleton
- Caricamento: useGLTF, useTexture, Suspense
- Shader: GLSL via ShaderMaterial, uniforms, time

## Performance

- InstancedMesh per oggetti ripetuti
- LOD (Level of Detail)
- useFrameloop = "demand" per risparmiare batteria
- GPU picking invece di raycasting su molte mesh
- Compressione GLTF (gltf-transform / draco)
