# 月栖·夜 (Yueqi Night) Asset Generation QA

- Stage: poses
- Selected candidate: 1
- Verified generated artifacts: 4
- Manifest frames: 24
- Background removal: rembg isnet-anime is mandatory; local gray/magenta fallback is rejected
- Retouch: stripNeutralShadow on sit/sleep family; register standing/loop frames to lock or prior keyframe
- Consistency: standing silhouette height/center/foot drift vs lock (GATE D)

## Generated Artifacts

| ID | Output | Model | Foreground | Transparent | Checker | Bounds |
|---|---|---|---:|---:|---:|---|
| pose:greet_0 | poses/greet_0.png | doubao-seedream-4-5-251128 | 0.2151 | 0.7846 | 0 | 469,54,598,1444 |
| pose:sit | poses/sit.png | doubao-seedream-4-5-251128 | 0.196 | 0.8039 | 0 | 443,73,624,1404 |
| pose:sleep | poses/sleep.png | doubao-seedream-4-5-251128 | 0.117 | 0.8827 | 0 | 221,545,1094,454 |
| pose:talk_0 | poses/talk_0.png | doubao-seedream-4-5-251128 | 0.2062 | 0.7936 | 0 | 494,54,549,1444 |

## Manual Gate (GATE E)

Before importing, inspect the contact sheet for face, hair, clothing, hand, body-scale, and action continuity drift.
Automated PNG/alpha/consistency checks do not fully prove artistic identity; still reject mature 5.5-head faces and broken anatomy by eye.
