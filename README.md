# LewdLand

LewdLand 是一个面向本地目录和 WebDAV 的媒体资源库，适合整理按消息目录导出的资源数据。程序会扫描每条消息目录中的 `meta.json`、`README.md` 和媒体文件，建立索引，并提供首页主题、主题资源列表、详情页、搜索、分页、管理后台和扫描功能。

当前支持：

- 本地目录数据源
- WebDAV 数据源
- 图片缩略图
- 视频首帧静态封面
- 后台扫描任务和进度显示

## 技术架构

- 后端：Node.js + Express
- 数据库：SQLite（Node 内置 `node:sqlite`）
- 前端：Vue 3 + Vite + Tailwind CSS
- 图片处理：sharp
- 视频首帧提取：ffmpeg

## 目录结构

```text
server/
  config.js            # 端口、数据目录等配置
  db.js                # SQLite 初始化和表结构
  index.js             # 服务入口
  util.js              # 工具函数
  parse/
    readme.js          # README.md 解析
  routes/
    auth.js            # 登录、登出、改密码
    admin.js           # 管理接口、扫描接口
    media.js           # 媒体和缩略图接口
    public.js          # 前台接口
  services/
    scanner.js         # 扫描逻辑
    scanJobs.js        # 扫描任务队列
    thumbnail.js       # 图片缩略图、视频首帧封面
    webdavClient.js    # WebDAV 访问

client/
  src/                 # Vue 前端源码
  dist/                # 前端构建产物

data/
  app.sqlite           # 数据库
  thumbs/              # 缩略图和封面缓存
```

## 环境要求

### Node 版本

项目依赖 `node:sqlite`，因此 Node 版本不能太低。

- 最低可用：`v22.13.0`
- 推荐版本：`v24.x`

### 系统依赖

无论你采用哪种部署方式，只要要生成视频首帧封面，就需要：

- `ffmpeg`

如果缺少 `ffmpeg`，图片资源仍可正常使用，但纯视频资源的静态封面会生成失败。

## 启动方式一：从源码安装并启动

适合本机直接运行，或你希望完全手动控制环境。

### 1. 安装依赖

在项目根目录执行：

```bash
npm install
cd client && npm install
```

### 2. 构建前端

```bash
cd client
npm run build
cd ..
```

### 3. 准备系统依赖

Debian / Ubuntu：

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

Alpine：

```bash
apk add --no-cache ffmpeg
```

### 4. 启动服务

默认端口为 `3000`，默认数据目录为项目下的 `data/`。

```bash
npm start
```

如果你要指定端口、数据目录和管理员初始密码：

```bash
PORT=3000 \
LEWDLAND_DATA=/path/to/data \
SESSION_SECRET=your-random-secret \
ADMIN_DEFAULT_PASSWORD=your-password \
node server/index.js
```

### 5. 打开后台

浏览器访问：

```text
http://localhost:3000/admin
```

首次登录使用你设置的 `ADMIN_DEFAULT_PASSWORD`。如果没有设置，默认是：

```text
admin
```

## 启动方式二：使用 shell 脚本安装并启动

适合 Linux 主机直接安装，脚本会自动完成依赖安装、Node 安装、前端构建、systemd 服务注册等步骤。

脚本文件：

- [install.sh](C:/AAA/Projects/LewdLand/install.sh)

### 1. 克隆项目

```bash
git clone https://github.com/666zhaobo666/LewdLand.git
cd LewdLand
```

### 2. 执行安装脚本

```bash
sudo bash install.sh
```

### 3. 按菜单完成安装

未安装时菜单会显示：

```text
1) 安装
0) 退出
```

安装完成后脚本会：

- 安装 Node 24
- 安装 `ffmpeg`
- 安装后端依赖
- 安装并构建前端
- 创建 systemd 服务
- 创建配置文件

### 4. 服务管理

安装后可用：

```bash
sudo systemctl start lewland
sudo systemctl restart lewland
sudo systemctl stop lewland
sudo systemctl status lewland
sudo journalctl -u lewland -f
```

### 5. 默认部署目录

- 代码目录：`/opt/lewland`
- 配置文件：`/etc/lewland/lewland.env`
- 数据目录：`/var/lib/lewland`
- 服务文件：`/etc/systemd/system/lewland.service`

### 6. 配置文件示例

`/etc/lewland/lewland.env` 中通常包含：

```env
PORT=3000
LEWDLAND_DATA=/var/lib/lewland
SESSION_SECRET=your-random-secret
ADMIN_DEFAULT_PASSWORD=admin
```

修改后记得重启服务：

```bash
sudo systemctl restart lewland
```

## 启动方式三：使用 Docker 启动

适合容器化部署。项目已提供：

- [Dockerfile](C:/AAA/Projects/LewdLand/Dockerfile)
- [.dockerignore](C:/AAA/Projects/LewdLand/.dockerignore)

这个 Dockerfile 已经包含：

- 多阶段构建
- 前端生产构建
- `ffmpeg` 安装
- `/data` 作为数据卷目录

### 1. 构建镜像

在项目根目录执行：

```bash
docker build -t lewdland .
```

### 2. 启动容器

最简单的启动方式：

```bash
docker run -d \
  --name lewdland \
  -p 3000:3000 \
  -e SESSION_SECRET="your-random-secret" \
  -e ADMIN_DEFAULT_PASSWORD="your-password" \
  -v /your/lewdland-data:/data \
  lewdland
```

如果宿主机路径里有空格，记得整体加引号：

```bash
docker run -d \
  --name lewdland \
  -p 52022:3000 \
  -e SESSION_SECRET="your-random-secret" \
  -e ADMIN_DEFAULT_PASSWORD="your-password" \
  -v "/vol1/1000/AAA/ 福利局:/data" \
  lewdland
```

### 3. 挂载本地媒体目录

如果你要添加本地目录数据源，而不是纯 WebDAV，需要把宿主机媒体目录也挂进容器。

例如：

```bash
docker run -d \
  --name lewdland \
  -p 3000:3000 \
  -e SESSION_SECRET="your-random-secret" \
  -e ADMIN_DEFAULT_PASSWORD="your-password" \
  -v /your/lewdland-data:/data \
  -v /your/media:/media:ro \
  lewdland
```

这时在管理后台里填写本地数据源路径时，要填容器内路径：

```text
/media
```

不要填宿主机路径。

### 4. 查看日志

```bash
docker logs -f lewdland
```

### 5. 停止和删除容器

```bash
docker stop lewdland
docker rm lewdland
```

## 后台首次使用

无论你采用哪种启动方式，首次启动后都建议按下面步骤操作：

### 1. 打开管理页

```text
http://你的IP:端口/admin
```

### 2. 登录后台

使用 `ADMIN_DEFAULT_PASSWORD` 登录。

### 3. 新建主题

例如：

- AV解说
- Cos写真
- 收藏视频

### 4. 添加数据源

支持两种：

- `local`：本地目录
- `webdav`：WebDAV 地址

### 5. 测试连接

建议先点“测试连接”，确认可读。

### 6. 扫描资源

扫描支持：

- 单个主题扫描
- 单个数据源扫描
- 全部主题扫描

扫描会在后台进行，页面中会显示当前状态和进度。

## 数据目录说明

默认数据目录包含：

```text
app.sqlite
thumbs/
```

其中：

- `app.sqlite`：数据库
- `thumbs/`：图片缩略图、视频封面缓存

如果删除 `thumbs/`，下次扫描时会重新生成。

## 视频封面说明

当前视频封面规则：

- 优先使用图片资源作为封面
- 如果没有图片，则使用视频第一秒附近的静态帧作为封面
- 主题卡片、主题资源卡片、资源详情顶层封面都遵循这条规则

如果视频封面没有显示，优先检查：

```bash
curl http://127.0.0.1:3000/api/media/poster/health
```

正常应返回：

```json
{"ok":true,"version":"ffmpeg version ..."}
```

如果返回失败，通常是：

- 没安装 `ffmpeg`
- Docker 镜像没更新
- 运行的不是当前最新代码

## 开发模式

后端热更新：

```bash
node --watch server/index.js
```

前端开发服务：

```bash
cd client
npm run dev
```

## 常用环境变量

```env
PORT=3000
LEWDLAND_DATA=/path/to/data
SESSION_SECRET=your-random-secret
ADMIN_DEFAULT_PASSWORD=your-password
```

说明：

- `PORT`：服务端口
- `LEWDLAND_DATA`：数据库和缩略图目录
- `SESSION_SECRET`：登录会话签名密钥，生产环境必须自行设置
- `ADMIN_DEFAULT_PASSWORD`：管理员初始密码

## 常见问题

### Docker run 提示找不到 `lewdland:latest`

说明你本地还没构建镜像。先执行：

```bash
docker build -t lewdland .
```

再执行 `docker run`。

### 视频封面显示破图

优先检查：

```bash
curl http://127.0.0.1:3000/api/media/poster/health
```

如果失败，大概率是 `ffmpeg` 不存在，或者当前运行环境没更新到最新代码。

### 本地路径明明存在，后台却读不到

如果你用的是 Docker，后台填写的是容器内路径，不是宿主机路径。必须先通过 `-v` 把目录挂载到容器里。

### 扫描很慢

大规模资源首次扫描本来就会花时间，尤其是：

- 主题多
- 视频多
- WebDAV 远程资源多

建议：

- 先按主题分批扫描
- 保持后台扫描，不要频繁重复触发
- 确保网络和磁盘 IO 正常

## 许可证

当前仓库未单独声明许可证，使用前请自行确认你的分发和部署方式是否符合你的需求。
