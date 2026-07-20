---
name: motion-design
description: "Motion Design per UI/UX — animazioni di interfaccia, micro-interazioni, transizioni, Framer Motion, pagine, layout, gesti, varianti, animazioni di entrata/uscita, orchestrazione. Triggers: 'motion design', 'ui animation', 'framer motion', 'micro-interazione', 'transizione', 'varianti', 'gesti', 'animatepresence', 'layout animation', 'entrata uscita', 'animazione pagina', 'keyframes'."
---
# Motion Design — Animazioni UI/UX

Skill per animazioni di interfaccia web con Framer Motion e pattern di motion design.

## Framer Motion (Next.js/React)

### Varianti (orchestrazione)
```typescript
const variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.1 } }
}
<motion.div variants={variants} initial="hidden" animate="visible" />
```

### AnimatePresence (entrata/uscita)
```typescript
<AnimatePresence>
  {isOpen && <motion.div exit={{ opacity: 0, scale: 0.95 }} />}
</AnimatePresence>
```

### Gesti (hover, tap, drag)
```typescript
<motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
  drag="x" dragConstraints={{ left: -100, right: 100 }} />
```

### Layout animation (automatica)
```typescript
<motion.div layout layoutId="card" />
```

## Principi di Motion Design

- **Durata**: micro-interazioni 150-300ms, transizioni pagine 300-500ms
- **Easing**: ease-in-out per entry/exit, spring per naturali, anticipate per enfasi
- **Gerarchia**: stagger tra elementi padre→figli (dare ritmo)
- **Material Design motion**: rispondente, naturale, consapevole (spazio, energia)
- **Performance**: anima solo transform e opacity, evita layout triggers

## Pattern comuni

- Fade + slide per pagine
- Scale per modal/dialog
- Stagger per liste/grid
- Path drawing per illustrazioni
- Parallax per storytelling
- Scroll-triggered reveal
