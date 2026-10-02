# 月栖移动端问题修复计划

> 目标：把当前小手机壳从“能展示的 demo”修到可连续使用的手机产品。本文是给 Cursor 的执行单，按顺序完成，不要再用零散的 media query 覆盖旧规则。

## 1. 当前边界与工作区状态

本计划只覆盖用户最新反馈的移动端问题：

1. 小手机桌面左右滑页只能向右。
2. 记忆/日记内页翻页无效。
3. 商城同一页面出现两个返回/退出按钮。
4. 探索的对话、任务、插件市场页面在窄屏下排版溢出。
5. 全局字号、按钮、卡片和间距过大，产品感像 demo。
6. 通话弹窗或最后一张卡片超出屏幕，并可能遮挡底部 dock。

不要在本轮修改小手机的业务范围、角色资产、数据模型或 Android 原生 host。允许修改小手机壳的交互、布局和 CSS；允许修改 App 壳的通话弹窗响应式布局。

工作区已有大量未提交改动，开始前只能查看和基于现状修改，禁止 `git reset`、`git checkout` 或批量清理。

本轮已经生成但尚未接入的文件：

- `src/ui/mobile-density.css`

Cursor 开始时先检查这个文件。如果内容符合本计划，把它接入 `index.html`，放在 `app-memory-shell.css` 之后；如果不符合，直接重写它。不能让它成为未加载的孤立文件。

本轮已经存在的相关改动也要保留并复核：

- `src/phone-shell/os-home-pager.js`
- `src/phone-shell/app-screens.js`
- `src/phone-shell/phone-shell.js`
- `src/skill-platform/ui/explore.css`
- `src/skill-platform/ui/skill-session-ui.js`
- `src/ui/phone-shell.css`
- `src/ui/nyra-app.css`
- `src/ui/interaction-motion.css`
- `src/platform/interaction-motion.js`

## 2. 执行顺序

### 阶段 A：建立可重复的基线

在任何修改前执行：

```powershell
git status --short
npm run dev -- --host 127.0.0.1
```

用同一套状态分别测试 360x800、390x844、412x915 三个 viewport。至少记录以下 DOM 状态：

```js
document.documentElement.className
document.body.dataset.appMode
document.querySelector('[data-small-phone-root]')?.getBoundingClientRect()
```

对每个页面检查：

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

如果不成立，继续查出真正超宽的元素，不要只在最外层使用 `overflow-x: hidden` 掩盖问题。

### 阶段 B：修复桌面左右分页

主要文件：

- `src/phone-shell/os-home-pager.js`
- `src/phone-shell/home-layout.js`
- `src/phone-shell/os-icon-edit.js`
- `src/phone-shell/phone-shell.js`

实现要求：

1. 只允许一个分页状态源：`pageIndex`，范围为 `0..pageCount-1`。
2. `pointerdown` 时记录 `pointerId`、起点 `clientX/clientY`、时间，并调用 `setPointerCapture`。
3. `pointermove` 只在水平位移明显大于垂直位移时处理，避免垂直滚动被拦截。
4. `pointerup` 和 `pointercancel` 都必须释放 capture 并清理临时状态。
5. `dx < 0` 表示向左翻到下一页；`dx > 0` 表示向右翻到上一页。两端必须稳定停留，不能回弹到错误页。
6. 编辑图标模式和普通模式都使用同一套分页函数；拖拽图标开始时取消分页手势，点击图标仍然能打开应用。
7. 不要通过 `preventDefault` 全局拦截整个手机根节点，只在确认水平分页手势后拦截。
8. 给分页容器设置 `touch-action: pan-y`，让垂直滚动保留给浏览器/WebView。

验收：

- 在第一页向左滑，进入第二页。
- 在第二页向右滑，回到第一页。
- 在最后一页向左滑不越界。
- 上下滑动桌面仍能滚动，不被分页逻辑吞掉。
- 图标长按编辑、普通点击和分页互不干扰。

### 阶段 C：修复记忆/日记翻页

主要文件：

- `src/phone-shell/app-screens.js`
- `src/phone-shell/phone-shell.js`
- `src/phone-shell/phone-calendar.js`
- `src/phone-shell/phone-reader.js`
- `src/ui/diary-book.js`

实现要求：

1. 先确认当前实际页面是 `data-phone-screen="diary"` 还是 reader/book 组件，不能同时让两个翻页系统抢事件。
2. `data-diary-page-prev`、`data-diary-page-next` 必须各自只有一个事件入口；按钮不能只更新动画而不更新当前页数据。
3. 页码使用单一 `currentPage`，渲染、底部 `1 / 3`、左右按钮 disabled 状态都从同一状态计算。
4. 左滑进入下一页，右滑进入上一页。触摸事件只绑定在日记 stage，不绑定整个 mini-phone。
5. 空日记和第一页/最后一页都要有明确边界，不允许出现空白页、负数页码或内容与页码不一致。
6. 月份切换与内页翻页分开：月份按钮只改变日历月份，左右翻页只改变当前日记页。
7. 如果第三方翻页组件加载失败，保留一个 DOM 内容切换 fallback，使功能不依赖动画库是否初始化。

验收：

- 点击右箭头显示第 2 页，点击左箭头回到第 1 页。
- 左右滑动有同样结果。
- 第 3 页继续向左不会变空或越界。
- 翻页后标题、日期、正文、`n / total` 同步变化。
- 点击“日历”不会误触发翻页。

### 阶段 D：商城只保留一个返回层级

主要文件：

- `src/phone-shell/app-screens.js`
- `src/phone-shell/phone-shop.js`
- `src/phone-shell/phone-shell.js`

实现要求：

1. 先在浏览器 Elements 中确认两个箭头的来源：通常是 mini appbar 的返回按钮和商城内部 pane 的返回按钮同时显示。
2. 每个商城 pane 只保留一个可见返回按钮：
   - 商城首页：返回手机桌面。
   - 商品详情、购物袋、订单详情：返回商城上一层。
3. 不要删除整个导航栈；删除的是重复的可见控件或重复渲染。
4. `appViewStack` 仍是唯一返回状态；按钮统一调用 `goBack()`，禁止一个按钮调用 `exitToHome()`、另一个按钮调用自定义 pane 切换。
5. 返回按钮的 aria-label、页面标题和浏览器后退行为保持一致。

验收：

- 商城订单详情顶部只出现一个返回箭头。
- 从订单详情返回订单列表，再返回商城首页，再返回手机桌面，层级正确。
- Android 系统返回键与页面返回键结果一致。

### 阶段 E：重做探索窄屏排版

主要文件：

- `src/skill-platform/ui/explore.css`
- `src/skill-platform/ui/explore-ui.js`
- `src/skill-platform/ui/skill-session-ui.js`
- 生成探索页面 markup 的对应文件

实现要求：

1. 所有 grid/flex 子项设置 `min-width: 0`；宽度使用 `width: 100%`、`max-width: 100%`，禁止固定宽度撑开父级。
2. 顶部标题、副标题和右侧操作按钮在 360px 下必须能换行；右侧 `+` 使用独立 44px 命中区。
3. “对话 / 任务 / 插件市场” tabs 使用 `grid-template-columns: repeat(3, minmax(0, 1fr))`，文字允许换行但不能遮挡下划线。
4. 任务说明、插件说明、订单号、长文件名使用 `overflow-wrap: anywhere`；代码或 ID 可用横向滚动的小区域，但不能让整个页面横向溢出。
5. 创建任务按钮、导入 zip、导入文件夹和插件操作按钮使用一列或可换行布局；不允许多个大按钮挤在同一行。
6. 卡片内容区用 `padding: 12px` 左右，按钮组用 `gap: 8px`，不要给卡片内部再套一个同样有边框的卡片。
7. 任务输入框应至少 96px 高，按钮至少 44px 高；输入获得焦点时不能触发页面缩放或被底部 dock 遮挡。
8. 在数据为空、加载中、错误和有内容四种状态分别检查布局。

验收：

- 360px 宽度下探索三页都没有横向滚动条。
- 任务长说明完整换行；插件卡片按钮不出屏幕。
- 长任务名、zip 名称和错误文本不把按钮推到屏幕外。
- 键盘弹出后输入框仍可见，页面可以滚到提交按钮。

### 阶段 F：建立全局手机密度规范

主要文件：

- `src/ui/mobile-density.css`
- `index.html`
- 仅在必要时调整 `src/ui/phone-shell.css`

把 `mobile-density.css` 放在所有历史 phone CSS 之后加载。规则必须限定在：

```css
html.is-native-app .mini-phone
html.is-compact-shell .mini-phone
```

不要再给 `styles.css` 写全局 `!important`。

建议基线：

| 类型 | 视觉尺寸 | 触控尺寸 |
| --- | ---: | ---: |
| 页面标题 | 20-22px | 不适用 |
| 页面副标题/说明 | 12-14px | 不适用 |
| 普通正文 | 13-15px | 不适用 |
| 主要按钮文字 | 13-14px | 最小 44px 高 |
| 图标按钮 | 18-22px 图标 | 最小 44x44px |
| 设置行 | 13-14px | 最小 48px 高 |
| 卡片间距 | 8-12px | 不适用 |

必须同时加入：

- `box-sizing: border-box`。
- 所有 app scroll 容器 `min-width: 0`、`max-width: 100%`、`overflow-x: hidden`。
- 文本、标题、标签和按钮 `overflow-wrap: anywhere` 或合理换行。
- 只有确认水平分页时才阻止默认手势。
- 不能依赖按 viewport 宽度缩放字体；使用固定产品基线。

重点检查这些容易被历史 CSS 放大的组件：

- `.mini-appbar`
- `.mini-app-scroll`
- `.mini-app-cta`
- `.mini-home-greeting`
- `.mini-widget`
- `.mini-profile-block`
- `.mini-settings-block`
- `.mini-shop-*`
- `.mini-reader*`
- `.explore-*`

### 阶段 G：修复通话弹窗/固定卡片越界

主要文件：

- `src/ui/nyra-app.css`
- `src/ui/mobile-density.css`
- `index.html` 中 `#videoCallModal` 对应 markup

实现要求：

1. 小屏 modal panel 使用 `width: min(100%, 360px)`，并且 `box-sizing: border-box`。
2. modal 外层允许纵向滚动，panel 使用 `max-height: calc(100svh - 24px)`。
3. voice stage 在小屏使用接近正方形的比例并设置最大高度，头像从 112px 降到约 84px。
4. 操作按钮在小屏使用两列，挂断按钮占满一行；每个命中区仍至少 44px。
5. 底部 dock 高度必须计入 modal 的下内边距，不能让按钮藏在 dock 后面。
6. 所有固定尺寸图片、canvas、video 使用 `max-width: 100%`、`object-fit: contain`，不能把 panel 撑宽。

验收：

- 360x800 打开语音通话，panel 四边都在屏幕内。
- 390x844 打开视频/语音通话，所有按钮可见、可点、可滚动。
- 键盘、底部 dock、safe-area 同时存在时，挂断按钮仍可见。

## 3. Cursor 的合并顺序

按下面顺序逐批提交，任何一批失败先修复再进入下一批：

1. `os-home-pager` + 桌面分页回归。
2. `diary-book`/reader + 日记翻页回归。
3. `phone-shop` + 单返回按钮回归。
4. `explore.css`/探索 markup + 三个探索页面回归。
5. 接入并统一 `mobile-density.css`。
6. 通话弹窗响应式修复。
7. 全量构建和 APK 真机验收。

每一批只修改自己的文件范围。合并前检查：

```powershell
git diff --check
node --check src/phone-shell/os-home-pager.js
node --check src/phone-shell/phone-shell.js
node --check src/phone-shell/phone-reader.js
node --check src/phone-shell/phone-shop.js
node --check src/skill-platform/ui/explore-ui.js
node --check src/skill-platform/ui/skill-session-ui.js
```

## 4. 视觉和功能验收矩阵

### Viewport

- 360x800：最严格的窄屏基线。
- 390x844：主要 Android 手机基线。
- 412x915：较宽手机，检查组件没有被不必要放大。

### 页面

- 手机桌面：左右两向翻页、上下滚动、图标点击、编辑模式。
- 记忆：左右按钮、左右手势、第一页/最后一页、日历入口。
- 商城：商品详情、购物袋、订单列表、订单详情、单返回按钮。
- 探索：对话、任务、插件市场、空/加载/错误/有内容状态。
- 设置/角色：长标题、表单、分段控制、开关、键盘滚动。
- 通话：打开、接通、操作区、挂断、关闭、底部 dock 遮挡。

### 自动检查

```powershell
npm run verify:polish
npm run build
```

### 真机检查

```powershell
npm run build:android
```

卸载重装后逐项操作，不只看启动截图。至少记录：

- 每个页面是否能横向/纵向按预期操作。
- 是否出现蓝色浏览器焦点框或系统默认点击高亮。
- 是否有横向滚动条、裁切文本、出屏幕按钮、底部遮挡。
- 键盘弹出后输入框和提交按钮是否仍然可用。
- Android 系统返回键是否与页面返回按钮一致。

## 5. 完成定义

只有同时满足以下条件才可以标记完成：

1. 六个用户反馈问题全部通过上面的交互验收。
2. 360/390/412px 三个宽度没有横向溢出。
3. 触控命中区不小于 44px，但视觉字号和卡片密度不再像 demo。
4. `npm run verify:polish` 和 `npm run build` 通过。
5. APK 在真实 Android 设备上完成桌面、记忆、商城、探索、设置和通话路径验收。

不要用“Node 集成测试通过”替代最后一项；分页、WebView 手势、键盘和系统返回键必须在真机确认。
