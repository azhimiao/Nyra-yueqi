# Android 系统悬浮 · Play 政策预审材料（Phase 1）

> 用途：上架 Google Play 前准备 `specialUse` 前台服务说明与演示。  
> 许可：仅使用 Android 系统 API + Capacitor（MIT），无专有渲染 SDK。

## 1. 功能声明（给审核员）

月栖的悬浮陪伴是**用户主动开启**的核心功能：

- 用户在 App 内点击「开启悬浮陪伴」
- 先授予「显示在其他应用上层」
- 再启动前台服务，角色以透明小窗浮在其他应用上方
- 通知栏常驻「月栖悬浮陪伴中」，提供「返回月栖」「关闭悬浮」
- 用户可随时关闭；关闭后降级为 App 内浮层，**不假装仍在系统悬浮**

## 2. Foreground Service 类型

| 项 | 值 |
|----|-----|
| 类型 | `specialUse` |
| Manifest subtype | 用户主动开启的跨应用悬浮陪伴角色；服务可感知、可停止，仅服务于该功能 |
| 权限 | `FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_SPECIAL_USE`、`SYSTEM_ALERT_WINDOW`、`POST_NOTIFICATIONS` |
| 代码 | `OverlayService` + `CompanionOverlayPlugin` |

官方参考：

- [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types)
- [Google Play FGS requirements](https://support.google.com/googleplay/android-developer/answer/13392821)
- [Application overlay windows](https://developer.android.com/reference/android/view/WindowManager.LayoutParams)

## 3. Play Console 填写草稿

**Why does your app need this foreground service type?**

```text
Yueqi (月栖) provides a user-initiated floating companion that remains visible
while the user uses other apps. The foreground service hosts a transparent
overlay window (TYPE_APPLICATION_OVERLAY) and a persistent notification so the
user can return to the app or stop the overlay at any time. The service is
started only after the user grants overlay permission and explicitly taps
“Start floating companion”. It is not used for advertising, analytics, or
background data sync.
```

**Demo video checklist（建议 30–60 秒竖屏）：**

1. 打开月栖 → 角色页 →「系统悬浮陪伴」
2. 点击「去授权悬浮窗」→ 系统设置允许 → 返回
3. 点击「开启悬浮陪伴」→ 出现前台通知
4. 按 Home / 打开微信或其他 App → 角色仍浮在上方
5. 点击角色展开气泡/聊天小窗 →「打开聊天」回到月栖
6. 通知栏点「关闭悬浮」→ 悬浮消失，App 内浮层恢复

## 4. 验收对照（§6.1）

| # | 验收项 | 工程状态 | 真机记录 |
|---|--------|----------|----------|
| 1 | 授权后退到后台仍浮在其他应用上方 | 已实现 OverlayService | 见 OEM 矩阵 |
| 2 | 拒绝权限明确降级 | 已实现文案 + App 内浮层 | |
| 3 | 收起/气泡/聊天三态 | `overlay.html` | |
| 4 | Service 重启后恢复位置/外表/未读 | SharedPreferences 状态 | |
| 5 | 通知「返回月栖」「关闭悬浮」 | 已实现 | |
| 6 | 改外表无需重装即可更新 | `updateState` + look 事件 | |
| 7 | 国产机权限/锁屏/后台 | 兼容指南 + OEM 矩阵 | |

## 5. 不做承诺

- 不自动修改厂商自启动/省电设置
- 不承诺绝对保活；被杀后依赖用户再次开启与状态恢复
- iOS 不做同款系统悬浮
