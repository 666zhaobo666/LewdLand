# LewdLand

本地/WebDAV 媒体库应用。针对 Telegram 频道扒取的资源(`meta.json` + `README.md` + 媒体文件夹)建立索引，提供卡片瀑布流、搜索、分页、图片画廊、视频播放的现代化 Web 界面。

## 架构

- **后端**：Node.js + Express，数据存于内置 `node:sqlite`(SQLite)，无需安装数据库服务
- **前端**：Vue 3 + Vite + Tailwind CSS(亮/暗主题)
- **图片画廊**：PhotoSwipe(手势放大、上一张/下一张)
- **视频播放**：ArtPlayer(B站风格、移动端触摸、横竖屏智能全屏、倍速、长按快进)
- **资源适配**：统一抽象 `local`(本地目录) 与 `webdav`(远程) 两种数据源

扫描时将每个消息文件夹的 `meta.json`/`README.md` 解析入库，并生成 640px WebP 封面缩略图；前端展示、搜索、分页全部查数据库，仅点击媒体时才走文件流(支持 HTTP Range，视频可拖拽进度条)。

## 目录结构

```
server/
  config.js            # 数据目录、端口等配置
  db.js                # SQLite schema + 设置/管理员初始化
  util.js              # 媒体类型判定、路径安全拼接
  index.js             # Express 入口
  cli.js               # 命令行扫描: node server/cli.js scan
  parse/readme.js      # README.md 解析(标签/标题/简介/发布时间)
  services/
    scanner.js         # 扫描引擎(local+webdav 适配器、递归查找、UPSERT、清理)
    thumbnail.js       # sharp 缩略图生成
    webdavClient.js    # webdav 客户端缓存
  routes/
    auth.js            # 登录/登出/改密/鉴权中间件
    admin.js           # 主题/数据源/扫描/测试连接(需登录)
    public.js          # 主题列表/消息分页搜索/详情/标签(公开)
    media.js           # 媒体流代理(本地 Range / WebDAV 透传)、缩略图
client/
  src/                 # Vue 前端(首页/主题页/详情页/管理页/登录页)
```

## 快速开始

### 1. 安装依赖

```bash
# 后端
npm install
# 前端
cd client && npm install
```

### 2. 构建前端

```bash
npm run build          # 即 cd client && npm run build，产物在 client/dist/
```

### 3. 启动服务

```bash
npm start              # 默认 http://localhost:3000
# 或指定端口/数据目录
PORT=8080 LEWDLAND_DATA=/path/to/data node server/index.js
```

默认管理员密码为 `admin`，首次启动会自动创建，登录后请立即在管理页修改。

### 4. 配置与扫描

1. 打开 `http://localhost:3000/admin` → 用密码登录
2. 新建主题(主题名不可重复)
3. 给主题添加数据源：
   - **local**：填本地目录绝对路径，如 `D:\Media\Channels` 或 `/mnt/d/Media/Channels`
   - **webdav**：填 WebDAV URL + 用户名 + 密码
4. 点击「测试连接」确认可达，保存后点「扫描」
5. 扫描完成后回到首页即可看到主题与卡片

一个主题可绑定多个数据源(多个频道文件夹 / 多个 WebDAV 地址)，扫描后所有消息会合并到同一主题下展示。

## 数据源期望的目录结构

每个**消息文件夹**含：

```
频道名-消息ID/
├── meta.json          # source_chat / message_id / title / main_files[] / comment_files[]
├── README.md          # 含 Source chat / Published at / ## Description(#标签 + 标题简介)
├── <main 媒体文件>     # 路径相对该文件夹，如 photo_xxx.jpg
└── comments/          # 大量图片视频
    └── ...
```

扫描器递归查找所有含 `meta.json` 的文件夹，无需手动指定层级。

## 命令行批量扫描

```bash
npm run scan           # 扫描所有已启用数据源
```

## 开发模式

```bash
node --watch server/index.js     # 后端热重载
npm run client:dev               # 前端 dev server (5173，代理 /api 到 3000)
```

## 关键设计点

- **唯一键**：`(source_id, rel_dir)`，避免不同频道同 message_id 冲突
- **搜索**：标题/简介/标签/频道名 `LIKE` 模糊匹配，CJK 短词更准
- **路径隐藏**：前端只拿到 `/api/media/:messageId/:index`，看不到真实文件名与路径
- **幂等扫描**：基于唯一键 UPSERT，重复扫描不产生重复记录；消失的文件夹自动清理
- **缩略图**：扫描时生成，卡片页加载 640px WebP 而非原图
- **WebDAV 视频**：透传上游 Range 请求，支持大文件拖拽

## 数据存储

- `data/app.sqlite` — 数据库(主题/数据源/消息/标签)
- `data/thumbs/<source_id>/<hash>.webp` — 封面缩略图

可通过 `LEWDLAND_DATA` 环境变量指定其它数据目录。
