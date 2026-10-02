# First Light Motion Spec

## Tokens (`OnboardingMotionTokens`)

Implemented in `src/first-light/motion-tokens.js` and CSS variables on `.first-light`:

| Token | ms | Use |
| --- | --- | --- |
| `motion.instant` | 120 | Press feedback |
| `motion.quick` | 180 | Option fill / border |
| `motion.normal` | 280 | Scene enter |
| `motion.slow` | 420 | Aura fade |
| `motion.scene` | 560 | Overlay open |

Easings:

- `standard` — `cubic-bezier(0.2, 0, 0, 1)`
- `decelerate` — `cubic-bezier(0, 0, 0, 1)`
- `spring-soft` — `cubic-bezier(0.22, 1.2, 0.36, 1)`

## Behaviors

### Option select

Slight scale → spring back → fill/selected state. Total ≤ ~220ms. No unique per-button choreography.

### Scene change

Old content replaced; new `.fl-scene` enters with opacity + **14px** upward travel (`fl-enter`). No full-screen horizontal fly-ins.

### Aura / companion forming

Soft radial aura behind copy (`fl-aura`). Blur allowed only when motion is not reduced. Does not compete with reading.

### Commit

`.is-committing` on host; overlay closes after successful write; chat history reload shows first real message — no “生成成功 / 欢迎进入” interstitial.

## Reduced motion

- Class `is-reduced-motion` when `prefers-reduced-motion: reduce`
- Enter animation disabled; aura blur removed
- Option transitions limited to opacity/color
- Flow remains fully operable without motion cues

## Haptics (best-effort)

| Event | Pattern |
| --- | --- |
| Select | light 8ms |
| Confirm relation | medium 18ms |
| Commit start | double pulse |
| Error | 30ms |

Respect `localStorage yueqi.haptics.off=1`. Sound default off; not required for comprehension.
