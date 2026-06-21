#!/usr/bin/env bash
# LewdLand 安装与管理脚本
# 仓库: https://github.com/666zhaobo666/LewdLand.git
# 部署架构(配置/数据与代码分离，git 更新不覆盖用户数据):
#   代码目录:   /opt/lewland          (git 仓库)
#   用户配置:   /etc/lewland/lewland.env  (端口、数据目录、session 密钥等)
#   数据目录:   /var/lib/lewland      (SQLite 数据库 + 缩略图，通过 LEWDLAND_DATA 指定)
#   systemd:    /etc/systemd/system/lewland.service
#   运行用户:   lewland (自动创建)

set -euo pipefail

# ---------- 常量 ----------
APP_NAME="lewland"
APP_DIR="/opt/lewland"
DATA_DIR="/var/lib/lewland"
CONFIG_DIR="/etc/lewland"
CONFIG_FILE="${CONFIG_DIR}/lewland.env"
SERVICE_FILE="/etc/systemd/system/lewland.service"
SERVICE_NAME="lewland.service"
RUN_USER="lewland"
REPO_URL="https://github.com/666zhaobo666/LewdLand.git"
# node:sqlite 内置模块要求(见 https://nodejs.org/api/sqlite.html):
#   - v22.5.0 起引入该模块
#   - v22.13.0 / v23.4.0 起无需 --experimental-sqlite flag(但仍 experimental)
#   - v24.0.0 起为 Release Candidate(Stability 1.2，最稳定)
# 本脚本一律安装 Node 24 LTS。

# ---------- 颜色 ----------
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_CYAN=$'\033[36m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_CYAN=""; C_BOLD=""; C_RESET=""
fi

log()   { echo "${C_GREEN}[✓]${C_RESET} $*"; }
warn()  { echo "${C_YELLOW}[!]${C_RESET} $*"; }
err()   { echo "${C_RED}[✗]${C_RESET} $*" >&2; }
info()  { echo "${C_BLUE}[i]${C_RESET} $*"; }
die()   { err "$*"; exit 1; }

# ---------- 环境检测 ----------
detect_pm() {
  if   command -v apt-get >/dev/null 2>&1; then PM="apt"; PM_INSTALL="apt-get install -y"
  elif command -v dnf     >/dev/null 2>&1; then PM="dnf"; PM_INSTALL="dnf install -y"
  elif command -v yum     >/dev/null 2>&1; then PM="yum"; PM_INSTALL="yum install -y"
  elif command -v pacman  >/dev/null 2>&1; then PM="pacman"; PM_INSTALL="pacman -S --noconfirm"
  elif command -v zypper  >/dev/null 2>&1; then PM="zypper"; PM_INSTALL="zypper install -y"
  else PM="unknown"; PM_INSTALL=""; fi
}

have_systemd() { [[ -d /run/systemd/system ]] && command -v systemctl >/dev/null 2>&1; }

# ---------- 基础安装步骤 ----------
install_packages() {
  detect_pm
  [[ "$PM" == "unknown" ]] && { warn "无法识别包管理器，跳过系统依赖安装(请自行确保 git/node 已安装)"; return 0; }
  local pkgs=(git curl ca-certificates ffmpeg)
  # Node 安装交给 NodeSource，这里只装编译 sharp 可能需要的(部分系统 sharp 需构建工具)
  case "$PM" in
    apt) pkgs+=(build-essential python3);;
    dnf|yum) pkgs+=(gcc-c++ make python3);;
    pacman) pkgs+=(base-devel python);;
    zypper) pkgs+=(patterns-devel_basis-devel python3);;
  esac
  info "通过 $PM 安装依赖: ${pkgs[*]}"
  if [[ "$PM" == "apt" ]]; then apt-get update -y >/dev/null 2>&1 || true; fi
  $PM_INSTALL "${pkgs[@]}" >/dev/null 2>&1 || warn "部分系统包安装失败，继续尝试"
}

install_node() {
  # 检查已有 Node 是否满足 node:sqlite 无 flag 要求(>=24，或 23.x>=4，或 22.x>=13)
  if command -v node >/dev/null 2>&1; then
    local v major minor rest
    v=$(node -v 2>/dev/null | sed 's/v//')      # e.g. 24.15.0
    major=${v%%.*}; rest=${v#*.}; minor=${rest%%.*}
    if [[ "$major" =~ ^[0-9]+$ ]] && {
         [[ "$major" -ge 24 ]] ||
         [[ "$major" -eq 23 && "$minor" -ge 4 ]] ||
         [[ "$major" -eq 22 && "$minor" -ge 13 ]];
       }; then
      log "已安装 Node $(node -v) (满足 node:sqlite 要求)"
      return 0
    fi
    warn "Node $(node -v) 不满足要求(需 >=22.13 或 >=24)，安装 Node 24"
  else
    info "未检测到 Node，安装 Node 24 LTS"
  fi
  info "通过 NodeSource 安装 Node.js 24"
  if [[ "$PM" == "apt" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null 2>&1 || die "NodeSource setup 失败"
    apt-get install -y nodejs >/dev/null 2>&1 || die "安装 nodejs 失败"
  elif [[ "$PM" == "dnf" || "$PM" == "yum" ]]; then
    curl -fsSL https://rpm.nodesource.com/setup_24.x | bash - >/dev/null 2>&1 || die "NodeSource setup 失败"
    $PM_INSTALL nodejs >/dev/null 2>&1 || die "安装 nodejs 失败"
  else
    # pacman/zypper 或未知: 用官方二进制
    local arch; arch=$(uname -m)
    case "$arch" in x86_64) arch="x64";; aarch64|arm64) arch="arm64";; *) die "不支持的架构 $arch";; esac
    local ver="v24.0.0"
    local tmp="/tmp/node.tar.xz"
    curl -fsSL "https://nodejs.org/dist/${ver}/node-${ver}-linux-${arch}.tar.xz" -o "$tmp" || die "下载 Node 失败"
    tar -xJf "$tmp" -C /usr/local --strip-components=1 || die "解压 Node 失败"
    rm -f "$tmp"
  fi
  command -v node >/dev/null 2>&1 || die "Node 安装后仍不可用"
  log "Node $(node -v) 安装完成"
}

clone_repo() {
  if [[ -d "$APP_DIR/.git" ]]; then
    info "代码目录已存在，拉取最新代码"
    git -C "$APP_DIR" fetch --all >/dev/null 2>&1 || warn "fetch 失败"
    git -C "$APP_DIR" reset --hard origin/main >/dev/null 2>&1 || warn "reset 失败"
    return 0
  fi
  info "克隆仓库到 $APP_DIR"
  git clone --depth 1 "$REPO_URL" "$APP_DIR" >/dev/null 2>&1 || die "克隆仓库失败"
}

write_config() {
  mkdir -p "$CONFIG_DIR"
  # 若已存在则保留(用户配置不变)，否则写默认
  if [[ -f "$CONFIG_FILE" ]]; then
    log "用户配置已存在，保留: $CONFIG_FILE"
  else
    info "写入默认配置: $CONFIG_FILE"
    cat > "$CONFIG_FILE" <<ENV
# LewdLand 用户配置(此文件不会被 git 更新覆盖)
PORT=3000
LEWDLAND_DATA=${DATA_DIR}
SESSION_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)
ADMIN_DEFAULT_PASSWORD=admin
ENV
    chmod 600 "$CONFIG_FILE"
  fi
}

write_service() {
  have_systemd || { warn "未检测到 systemd，跳过服务单元安装(请手动用 nohup/pm2 启动)"; return 0; }
  info "写入 systemd 服务: $SERVICE_FILE"
  cat > "$SERVICE_FILE" <<SVC
[Unit]
Description=LewdLand Media Library
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${CONFIG_FILE}
ExecStart=$(command -v node) ${APP_DIR}/server/index.js
Restart=on-failure
RestartSec=5
# 数据目录可写
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
SVC
  systemctl daemon-reload >/dev/null 2>&1 || true
}

setup_user_and_perms() {
  if ! id "$RUN_USER" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$RUN_USER" >/dev/null 2>&1 || \
    useradd --system --no-create-home --shell /sbin/nologin "$RUN_USER" >/dev/null 2>&1 || true
    log "创建运行用户 $RUN_USER"
  fi
  mkdir -p "$DATA_DIR"
  chown -R "$RUN_USER":"$RUN_USER" "$DATA_DIR"
  # 代码目录归运行用户可读即可，安装时 root 操作
}

install_deps_app() {
  info "安装后端依赖"
  if ! (cd "$APP_DIR" && npm install --omit=dev --no-fund --no-audit >/dev/null 2>&1); then
    err "后端依赖安装失败。可手动进入 $APP_DIR 运行: npm install"
    return 1
  fi
  info "构建前端"
  if ! (cd "$APP_DIR/client" && npm install --no-fund --no-audit >/dev/null 2>&1 && npm run build >/dev/null 2>&1); then
    err "前端构建失败。可手动进入 $APP_DIR/client 运行: npm install && npm run build"
    return 1
  fi
  chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR/node_modules" "$APP_DIR/client" 2>/dev/null || true
  return 0
}

do_install() {
  [[ $EUID -eq 0 ]] || die "请使用 root 或 sudo 运行安装"
  detect_pm
  log "开始安装 LewdLand"
  install_packages
  install_node
  clone_repo
  install_deps_app || die "依赖安装/构建失败，请按提示修复后重新运行安装"
  write_config
  setup_user_and_perms
  write_service
  log "安装完成!"
  echo
  info "默认配置: $CONFIG_FILE (端口 3000，管理员密码 admin)"
  info "数据目录: $DATA_DIR"
  info "代码目录: $APP_DIR"
  have_systemd && info "服务: systemctl {start|stop|status|enable|disable} lewland"
  echo
}

# ---------- 已安装菜单动作 ----------
is_installed() {
  [[ -d "$APP_DIR/.git" ]] && [[ -d "$APP_DIR/node_modules" ]]
}

load_port() { . "$CONFIG_FILE" 2>/dev/null; echo "${PORT:-3000}"; }

svc_status() {
  have_systemd || { warn "无 systemd"; return 0; }
  systemctl status "$SERVICE_NAME" --no-pager 2>&1 | head -12 || true
}

menu_config_port() {
  [[ -f "$CONFIG_FILE" ]] || die "配置文件不存在，请先安装"
  local cur; cur=$(load_port)
  read -rp "${C_CYAN}输入新端口 [当前 ${cur}]: ${C_RESET}" port
  port="${port:-$cur}"
  [[ "$port" =~ ^[0-9]+$ ]] || die "端口必须为数字"
  sed -i "s/^PORT=.*/PORT=${port}/" "$CONFIG_FILE"
  log "端口已改为 $port (重启服务后生效)"
}

menu_start() {
  have_systemd || die "无 systemd，无法管理服务"
  systemctl start "$SERVICE_NAME" && log "服务已启动" || err "启动失败"
  sleep 1; systemctl is-active --quiet "$SERVICE_NAME" && info "运行中 → http://localhost:$(load_port)" || svc_status
}

menu_stop() {
  have_systemd || die "无 systemd"
  systemctl stop "$SERVICE_NAME" && log "服务已停止" || err "停止失败"
}

menu_restart() {
  have_systemd || die "无 systemd"
  systemctl restart "$SERVICE_NAME" && log "服务已重启" || err "重启失败"
  sleep 1; systemctl is-active --quiet "$SERVICE_NAME" && info "运行中 → http://localhost:$(load_port)" || svc_status
}

menu_autostart() {
  have_systemd || die "无 systemd"
  echo "  1) 开启开机自启"
  echo "  2) 关闭开机自启"
  read -rp "选择 [1/2]: " c
  case "$c" in
    1) systemctl enable "$SERVICE_NAME" && log "已开启自启" ;;
    2) systemctl disable "$SERVICE_NAME" && log "已关闭自启" ;;
    *) warn "未选择";;
  esac
}

menu_update() {
  [[ -d "$APP_DIR/.git" ]] || die "代码目录不存在"
  log "更新代码(保留用户配置与数据)..."
  info "拉取最新代码"
  # 备份可能的本地改动(以防万一)，然后强制同步远程
  git -C "$APP_DIR" fetch --all >/dev/null 2>&1 || die "fetch 失败，请检查网络"
  local local_hash remote_hash
  local_hash=$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo "")
  remote_hash=$(git -C "$APP_DIR" rev-parse origin/main 2>/dev/null || echo "")
  if [[ "$local_hash" == "$remote_hash" ]]; then
    log "已是最新版本，无需更新"
    return 0
  fi
  git -C "$APP_DIR" reset --hard origin/main >/dev/null 2>&1 || die "更新代码失败"
  git -C "$APP_DIR" clean -fd >/dev/null 2>&1 || true
  log "代码已更新到最新"
  info "重新安装依赖并构建前端"
  if ! install_deps_app; then
    err "依赖/前端构建失败，服务未重启。请修复后重试更新"
    warn "代码已更新但运行时依赖未就绪。手动修复: cd $APP_DIR && npm install; cd client && npm install && npm run build"
    return 1
  fi
  # 重启服务(若在运行)
  if have_systemd && systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl restart "$SERVICE_NAME" && log "服务已重启"
  fi
  log "更新完成! 当前版本: $(git -C "$APP_DIR" rev-parse --short HEAD)"
}

menu_uninstall() {
  echo "${C_YELLOW}这将删除: 服务、代码目录、配置、数据目录${C_RESET}"
  read -rp "${C_RED}确认卸载? 输入 yes 确认: ${C_RESET}" ans
  [[ "$ans" == "yes" ]] || { warn "已取消"; return 0; }
  have_systemd && { systemctl stop "$SERVICE_NAME" 2>/dev/null || true; systemctl disable "$SERVICE_NAME" 2>/dev/null || true; rm -f "$SERVICE_FILE"; systemctl daemon-reload >/dev/null 2>&1 || true; }
  rm -rf "$APP_DIR" "$CONFIG_DIR" "$DATA_DIR"
  id "$RUN_USER" >/dev/null 2>&1 && { userdel "$RUN_USER" 2>/dev/null || true; }
  log "LewdLand 已卸载"
}

# ---------- 菜单 ----------
menu_uninstalled() {
  echo
  echo "${C_BOLD}=== LewdLand 安装管理 ===${C_RESET}"
  echo "  1) 安装"
  echo "  0) 退出"
  read -rp "选择 [0-1]: " c
  case "$c" in
    1) do_install; press_any_key;;
    0) exit 0;;
    *) warn "无效选择";;
  esac
}

menu_installed() {
  local port; port=$(load_port)
  echo
  echo "${C_BOLD}=== LewdLand 管理 ===${C_RESET}"
  have_systemd && { systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null && st="${C_GREEN}运行中${C_RESET}" || st="${C_RED}已停止${C_RESET}"; } || st="未知"
  have_systemd && { systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null && en="${C_GREEN}开${C_RESET}" || en="${C_RED}关${C_RESET}"; } || en="-"
  echo "  端口: ${port}  状态: ${st}  自启: ${en}"
  echo "  ----------------------------------------"
  echo "  1) 配置端口"
  echo "  2) 启动服务"
  echo "  3) 重启服务"
  echo "  4) 服务自启动管理"
  echo "  5) 停止服务"
  echo "  6) 更新"
  echo "  7) 卸载"
  echo "  0) 退出"
  read -rp "选择 [0-7]: " c
  case "$c" in
    1) menu_config_port;;
    2) menu_start;;
    3) menu_restart;;
    4) menu_autostart;;
    5) menu_stop;;
    6) menu_update;;
    7) menu_uninstall;;
    0) exit 0;;
    *) warn "无效选择";;
  esac
  press_any_key
}

press_any_key() {
  echo
  read -rp "${C_CYAN}按回车返回菜单...${C_RESET}" _
}

# ---------- 入口 ----------
main() {
  [[ $EUID -eq 0 ]] || die "请使用 root 或 sudo 运行: sudo bash install.sh"
  while true; do
    clear 2>/dev/null || true
    if is_installed; then
      menu_installed
    else
      menu_uninstalled
    fi
  done
}

main "$@"
