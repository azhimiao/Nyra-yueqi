# First Light Accessibility Report

## Supported

| Requirement | Implementation |
| --- | --- |
| Reduced motion | `prefers-reduced-motion` + `.is-reduced-motion` |
| Screen reader | `role="dialog"`, `aria-modal`, `aria-live="polite"` on scene, labeled track |
| Keyboard | Native `<button>`, `<input>`, `<textarea>`, checkbox labels |
| Touch target | Options / footer controls `min-height: 44px` |
| Contrast | Ink/muted derived from theme; night theme overrides |
| Font scale | `rem` / `clamp` titles; system zoom respected |
| Disable haptics | `yueqi.haptics.off=1` |
| Disable sound | No default SFX in First Light |
| Tablet landscape | Centered scene, wider shell ≥900px |

## Reduced-motion verification

Covered by `npm run verify:first-light` (motion token presence + copy/flow independence) and CSS rules that strip translate/blur dependency.

## Remaining / device gates

- **iOS haptic engine** (Taptic) not wired beyond `navigator.vibrate` where available
- **VoiceOver / TalkBack** full scripted audit on device not run in CI
- High-contrast OS mode inherits theme tokens; no separate forced HC palette yet
