# 月栖·昼 (Yueqi Day) Asset Generation QA

- Stage: poses
- Selected candidate: 1
- Verified generated artifacts: 5
- Manifest frames: 24
- Background removal: rembg isnet-anime is mandatory; local gray/magenta fallback is rejected
- Retouch: stripNeutralShadow on sit/sleep family; register standing/loop frames to lock or prior keyframe
- Consistency: standing silhouette height/center/foot drift vs lock (GATE D)

## Generated Artifacts

| ID | Output | Model | Foreground | Transparent | Checker | Bounds |
|---|---|---|---:|---:|---:|---|
| lock_candidate_1 | character/lock_candidate_1.png | doubao-seedream-4-5-251128 | 0.181 | 0.8189 | 0 | 494,87,549,1357 |
| pose:greet_0 | poses/greet_0.png | doubao-seedream-4-5-251128 | 0.2188 | 0.7809 | 0 | 449,54,639,1444 |
| pose:sit | poses/sit.png | doubao-seedream-4-5-251128 | 0.2089 | 0.7911 | 0 | 412,86,632,1378 |
| pose:sleep | poses/sleep.png | doubao-seedream-4-5-251128 | 0.1154 | 0.8845 | 1 | 209,578,1118,402 |
| pose:talk_0 | poses/talk_0.png | doubao-seedream-4-5-251128 | 0.2159 | 0.7838 | 0 | 453,54,630,1444 |

## Manual Gate (GATE E)

Before importing, inspect the contact sheet for face, hair, clothing, hand, body-scale, and action continuity drift.
Automated PNG/alpha/consistency checks do not fully prove artistic identity; still reject mature 5.5-head faces and broken anatomy by eye.
