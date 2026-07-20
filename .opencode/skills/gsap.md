---
name: gsap
description: "GSAP (GreenSock) — animazioni web avanzate: timeline, tween, scrollTrigger, morphing, easing, stagger, animazioni scroll-based, sequenze complesse. Triggers: 'gsap', 'greensock', 'timeline', 'tween', 'scrolltrigger', 'morphing', 'easing', 'stagger', 'animazione scroll', 'sequenza animazione'."
---
# GSAP — GreenSock Animation Platform

Skill per animazioni web professionali con GSAP in progetti Next.js/React.

## Pattern principali

### Tween base
```typescript
gsap.to(element, { x: 100, duration: 1, ease: "power2.out" })
```

### Timeline (sequenze)
```typescript
const tl = gsap.timeline()
tl.to(el1, { opacity: 1, duration: 0.5 })
  .to(el2, { y: 0, duration: 0.3 }, "-=0.2")
  .to(el3, { scale: 1.2, duration: 0.4 })
```

### ScrollTrigger (animazioni su scroll)
```typescript
gsap.to(el, {
  scrollTrigger: { trigger: el, start: "top center", end: "bottom top", scrub: true },
  scale: 1.5, rotation: 360
})
```

## React Integration

- useGSAP() hook (da @gsap/react) per cleanup automatico
- Refs invece di querySelector
- Context per timeline condivise

## Best Practices

- Non animare layout properties (width/height/top) — usa transforms
- will-change: transform, opacity per GPU acceleration
- kill() sui tween quando il componente smonta
- ScrollTrigger.refresh() dopo layout shifts
