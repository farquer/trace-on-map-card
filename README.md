# Trace on Map Card

本项目参考自 [piotrmilcarz/historymapcard](https://github.com/piotrmilcarz/historymapcard)，经过AI魔改，感谢作者。

---

Home Assistant Lovelace card：在 **HA 默认地图**上展示实体位置历史，并支持时间轴播放 / 拖动。

地图完全使用前端自带的 `ha-map`。若你通过 `frontend.extra_module_url` 等方式替换了默认地图瓦片，本卡片会自动跟随，无需也不应在本卡片中配置任何第三方地图。

## 要求

- **Home Assistant Core ≥ 2026.9.0**（2026.9.x 及以上）
- 低于该版本时卡片会提示升级，不会加载地图
- 卡片通过 HA 前端的 `ha-map` 渲染；若尚未注册，会尝试 `loadCardHelpers` 探测加载原生 Map card 依赖

## 功能

- 多实体当前位置（与原生 Map card 一致的地图底座）
- 历史轨迹路径（History API）
- 时间轴：播放 / 暂停 / 拖动
- `zones`、`auto_fit`、`fit_zones`、`aspect_ratio`、`theme_mode`、`cluster`
- UI 配置器
- 范围模式：最近 / 天 / 周（默认天·当日；按 HA `time_zone`）
- `hours_to_show` 仅用于「最近」，默认 24，最大 720

## 安装

### HACS

1. HACS → Frontend → 右上角 ⋮ → Custom repositories
2. 添加本仓库，类别选 Lovelace（仪表盘）
3. 安装 **Trace on Map Card**
4. 刷新浏览器

### 手动

1. 将 `trace-on-map-card.js` 放到 `/config/www/`
2. 设置 → 仪表盘 → 资源，添加：
   - URL：`/local/trace-on-map-card.js`
   - 类型：JavaScript 模块
3. 刷新浏览器

## 配置示例

```yaml
type: custom:trace-on-map-card
title: Trace
entities:
  - entity: device_tracker.phone
    name: Phone
    color: "#0288d1"
  - person.alice
  - zone.home
hours_to_show: 24          # 仅「最近」模式使用
# range_mode: day          # 可选初始模式；不写则打开为天·当日
# max_timeline_points: 3000  # 可选；不写=不限制。大跨度建议设置
default_zoom: 14
auto_fit: true
fit_zones: false
cluster: true
theme_mode: auto
aspect_ratio: "16:9"
```

### 选项

| Key | 默认 | 说明 |
|-----|------|------|
| `entities` | 必填 | 实体 ID 或 `{entity,name,color}`；可含 `zone.*` |
| `hours_to_show` | `24` | 「最近」模式滚动窗口小时数，范围 1–720 |
| `range_mode` | 打开为 `day` | 可选初始模式：`recent` / `day` / `week`；运行时可在卡片上切换 |
| `max_timeline_points` | 不限制 | 可选。设置后按 24h 时间窗懒加载 History，单窗超过该点数会均匀降采样；**不写则一次拉全量（与旧行为一致）** |
| `default_zoom` | `14` | 默认缩放 |
| `auto_fit` | `true` | 自动缩放到实体 |
| `fit_zones` | `false` | 缩放时包含 zones |
| `cluster` | `true` | 标记聚合 |
| `theme_mode` | `auto` | `auto` / `light` / `dark` |
| `aspect_ratio` | — | 如 `16:9`；不设则固定高度 |
| `title` | — | 标题 |

卡片底部可切换 **最近 / 天 / 周**：天、周按 HA `config.time_zone`（缺失则回退浏览器本地时区）对齐日历；周为周一至周日；当日/本周时「›」禁用。**天**模式可点日期跳转（优先 HA 原生 `ha-date-input` / `ha-selector`，否则浏览器日期框；无需额外插件）。若要恢复旧的滚动小时体验，设 `range_mode: recent`。

实际可展示的历史长度还受 Home Assistant **Recorder** 保留策略限制。长跨度（周或 `hours_to_show: 720`）建议配置 `max_timeline_points`（例如 `3000`），避免一次拉全量导致卡顿。

## 开发

```bash
npm install
npm test
npm run build
# 产出：trace-on-map-card.js
```

## License

MIT
