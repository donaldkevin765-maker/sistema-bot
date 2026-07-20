---
name: design-dna
description: "Design DNA — sistema di design visivo, brand identity, design tokens, palette colori, tipografia, spaziatura, tema, dark mode, componenti di base, coerenza visiva, UI system, griglia, breakpoint. Triggers: 'design dna', 'design system', 'design token', 'brand identity', 'palette', 'tipografia', 'spaziatura', 'tema', 'dark mode', 'light mode', 'css variables', 'coerenza visiva', 'ui language', 'visual identity'."
---
# Design DNA — Sistema di Design Visivo

Skill per costruire e mantenere un sistema di design coerente in progetti Next.js con Tailwind CSS.

## Architettura del Design System

```
tokens/ (design tokens puri)
  ├── colors.json
  ├── typography.json
  ├── spacing.json
  ├── shadows.json
  └── breakpoints.json

components/ (componenti base)
  ├── ui/button, input, card, modal, ecc.
  └── layout/container, grid, stack

tokens → Tailwind config → CSS variables → Componenti
```

## Design Tokens

### Colori
```
Colori primari: brand principale (CTA, link, header)
Colori secondari: brand secondario (badge, tag, accenti)
Neutrali: testo, sfondi, bordi (50-950)
Semantici: success, warning, error, info
```

### Tipografia
```
Font family: heading + body (serif/sans)
Font scale: 12/14/16/18/20/24/30/36/48/60/72
Line height: tight(1.1) / normal(1.5) / relaxed(1.75)
Font weight: regular(400) / medium(500) / semibold(600) / bold(700)
```

### Spaziatura
```
Scala 4px: 0/4/8/12/16/20/24/32/40/48/64/80/96/128
Space / Gap / Padding / Margin
```

## Coerenza Visiva

- Stesso colore = stessa funzione (tutti i CTA sono primario)
- Stesso spacing = stesso ritmo
- Border radius coerente per tipo di componente
- Ombre coerenti (layer depth: surface, raised, overlay, modal)
- Dark mode = invertire luminosità, non hue
