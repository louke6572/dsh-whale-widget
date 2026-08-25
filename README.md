# DSH 小鲸鱼余额挂件 · 双版本表情版

> DSH Balance Whale Widget — DeepSeek Harness 网页右下角的常驻小鲸鱼挂件，支持**两套表情素材切换**、火山 Coding Plan 用量 / DeepSeek 余额双模式、情绪动画与自定义台词。

## ✨ 功能亮点

### 🐋 双表情版本切换
菜单里一键切换 **第一版 / 第二版** 两套表情素材：
- **第一版**：18 张（主图 + 生气/害羞/失落/疲惫/摸头 + OK/伤心/别吵/加油/压力大肥鱼/嘲笑/干什么/惊吓/打招呼/点赞 + 眨眼两帧）
- **第二版**：32 张（主图 + 生气了/脸红/哭唧唧/死机中 + 发呆/OK/什么/你的钱我收下了/可以给我吗/咬牙切齿/哦知道了/坏笑/墙角大肥鱼/大受震撼/好厉害/委屈/开心/得加钱/得意/懂你意思/无聊/点赞/牵强笑/疑问/竟然是/被发现了/超大声/超开心/震惊 + 眨眼两帧）
- 选择记忆在 localStorage，刷新保持；切换即时生效

### 💰 双数据模式
- **火山引擎 Coding Plan 用量**：5 小时 / 本周 / 本月百分比，多账号轮询
- **DeepSeek 官方余额**：¥ 实时查询

### 🎭 情绪动画（自动）
- 连点 5 次 → 生气
- 悬停 8 秒 → 害羞
- 2 分钟无交互 → 失落
- 配额 ≥90% → 疲惫模式
- 空闲随机眨眼 + 随机卖萌表情（25~60 秒）

### 🗣️ 台词系统
- 内置随机台词（6 组）+ 自定义台词（增删改、轮播/随机模式）
- 手动选择固定台词
- 情绪/卖萌表情不再配台词（表情管表情、台词管台词）

### ⚙️ 其他
- 大小可调（记忆）、气泡颜色、眨眼频率、音效、手动表情/台词锁定
- 图片加载失败自动重试（不卡破图）
- 刷新无闪现（尺寸 localStorage 秒预置）

## 📦 安装

标准 DSH 插件安装：

```bash
dsh plugin --profile web add link:<本仓库目录>
```

或复制仓库后：

```bash
dsh plugin --profile web add link:C:\path\to\dsh-Balance-Whale-Widget
```

重启 dsh web，浏览器 **Ctrl+F5** 强刷即可看到小鲸鱼。

## 📁 目录结构

```
dsh-Balance-Whale-Widget/
├── lib/index.js              # 插件本体（Node 路由 + 前端 WIDGET_JS）
├── package.json              # 插件声明（dsh.bundle）
├── cordis.patch.yml          # 挂载声明
├── assets/
│   ├── v1/                   # 第一版素材（18 张）
│   ├── v2/                   # 第二版素材（32 张）
│   └── *.mp3 / rua.gif       # 音效 / GIF
└── docs/
    ├── screenshots/          # 功能截图（12 张）
    ├── assets-第一版/         # 第一版素材预览（含中文名）
    └── assets-第二版/         # 第二版素材预览
```

## 📸 截图

| 功能 | 截图 |
|------|------|
| 两版表情切换 | ![两版切换](docs/screenshots/两版表情版本切换.png) |
| 手动表情选择 | ![手动表情](docs/screenshots/表情可手动选择固定.png) |
| 自定义台词 | ![自定义台词](docs/screenshots/自定义台词.png) |
| 台词手动切换 | ![台词切换](docs/screenshots/台词可手动切换.png) |
| 第一版总览 | ![第一版](docs/screenshots/版本1总览.png) |
| 第二版总览 | ![第二版](docs/screenshots/版本2总览.png) |

## 🖼️ 表情预览

**第一版**（18 张）：`docs/assets-第一版/`
**第二版**（32 张）：`docs/assets-第二版/`

## ⚠️ 说明

- 本插件是 DeepSeek Harness（dsh）的 cordis bundle 插件，需在 dsh 环境中运行
- 表情素材为作者原创/二创，仅用于本插件
- 数据源：火山引擎 OpenAPI（AK/SK 签名） + DeepSeek 官方 API

## 📄 License

MIT
