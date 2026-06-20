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

## Linux 部署(一键管理脚本)

仓库根目录提供 `install.sh` 交互式管理脚本，支持安装、配置端口、启停/自启管理、更新、卸载。**配置与数据与代码分离**，更新时用户配置和数据完全保留。

### 目录布局

| 路径 | 用途 | git 更新是否影响 |
|------|------|------------------|
| `/opt/lewland` | 代码(git 仓库) | 是(代码更新) |
| `/etc/lewland/lewland.env` | 用户配置(端口、数据目录、密钥) | 否(在仓库外) |
| `/var/lib/lewland` | 数据(SQLite + 缩略图) | 否(在仓库外) |
| `/etc/systemd/system/lewland.service` | systemd 服务 | 否 |

### 使用

```bash
# 克隆后直接运行(root/sudo)
git clone https://github.com/666zhaobo666/LewdLand.git
cd LewdLand
sudo bash install.sh
```

**未安装时**菜单只有:

```
1) 安装
0) 退出
```

**已安装时**菜单:

```
端口: 3000  状态: 运行中  自启: 开
----------------------------------------
1) 配置端口        5) 停止服务
2) 启动服务        6) 更新
3) 重启服务        7) 卸载
4) 服务自启动管理  0) 退出
```

### 安装脚本做了什么

1. 检测包管理器(apt/dnf/yum/pacman/zypper)，安装 git、curl、编译工具
2. 安装 Node.js 22(已装且版本够则跳过；apt/dnf/yum 走 NodeSource，其它用官方二进制)
3. 克隆仓库到 `/opt/lewland`
4. `npm install` 后端依赖 + 构建前端
5. 生成 `/etc/lewland/lewland.env`(随机 SESSION_SECRET，默认端口 3000，默认管理员密码 admin)
6. 创建 `lewland` 系统用户
7. 写入并 reload systemd 服务单元

### 更新机制(用户配置不变)

选择「更新」时：

1. `git fetch --all` 拉取远程
2. 对比本地与 `origin/main` 的 commit hash，相同则提示已是最新
3. `git reset --hard origin/main` + `git clean -fd` 同步代码(只影响 `/opt/lewland` 内 git 跟踪文件)
4. 重新 `npm install` + 构建前端
5. 若服务正在运行则自动重启

**`/etc/lewland/lewland.env` 和 `/var/lib/lewland` 不在 git 仓库内，更新绝不覆盖。** 端口、数据、已扫描的索引、缩略图全部保留。

### 卸载

卸载会删除服务、代码、配置、数据(需输入 `yes` 确认)。如需保留数据，卸载前先备份 `/var/lib/lewland`。

### 常用命令

```bash
sudo systemctl status lewland       # 查看状态
sudo systemctl restart lewland      # 重启
sudo journalctl -u lewland -f       # 查看日志
```
