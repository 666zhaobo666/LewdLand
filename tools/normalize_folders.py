#!/usr/bin/env python3
"""
normalize_folders.py
====================

独立工具，零依赖。对一个目录树做两件事：

  1) 把每个子目录里的 ``README.txt`` 改名为 ``README.md``。
  2) 在该子目录里新建 ``main/``，把所有媒体文件（图片和视频）移进去，
     但 ``README.md`` / ``README.txt`` 本身留在原位置不动。

已经存在 ``main/`` 的目录不会重复创建，里面已有的文件会保留、不会覆盖。

用法::

    python tools/normalize_folders.py <root-dir> [--dry-run] [--overwrite-main]
    python tools/normalize_folders.py <root-dir> -h
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path
from typing import List, Optional, Tuple

IMAGE_EXTS = {
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "heic", "heif", "tif", "tiff",
}
VIDEO_EXTS = {
    "mp4", "mkv", "webm", "mov", "avi", "flv", "m4v", "ts", "wmv", "m2ts", "3gp",
}
MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS

README_NAMES = {"README.md", "README.TXT", "README.txt", "Readme.md", "readme.md"}


def is_media(name: str) -> bool:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return ext in MEDIA_EXTS


def natural_sort_key(name: str):
    return [int(tok) if tok.isdigit() else tok.lower() for tok in __import__("re").split(r"(\d+)", name)]


def find_dirs(root: Path) -> List[Path]:
    """收集 root 下所有子目录（含 root 本身），跳过 main/ 和 comments/。"""
    dirs = [root]
    SKIP = {"main", "comments"}
    for cur, subdirs, _ in os.walk(root):
        # 过滤掉不需要递归进去的消息结构子目录
        subdirs[:] = [d for d in subdirs if d not in SKIP]
        for d in subdirs:
            dirs.append(Path(cur) / d)
    return dirs


def has_media_in_dir(abs_dir: Path) -> bool:
    for entry in os.scandir(abs_dir):
        if entry.is_file() and is_media(entry.name):
            return True
    return False


def normalize_one(abs_dir: Path, dry_run: bool, overwrite_main: bool) -> Tuple[int, int, List[str]]:
    """处理单个目录，返回 (renamed, moved, errors)。"""
    renamed = 0
    moved = 0
    errors: List[str] = []

    # 1) README.txt -> README.md
    for entry in os.scandir(abs_dir):
        if not entry.is_file():
            continue
        if entry.name == "README.md":
            continue
        # 任意大小写形式的 README.txt / README.TXT
        if entry.name.lower() == "readme.txt":
            target = Path(entry.path).with_name("README.md")
            if target.exists() and target != Path(entry.path):
                # 已存在 README.md：只删旧的 README.txt（避免目录里两个 README 冲突）
                if dry_run:
                    print(f"[dry-run] remove duplicate: {entry.path}")
                else:
                    try:
                        os.remove(entry.path)
                    except OSError as e:
                        errors.append(f"remove {entry.path}: {e}")
                continue
            if dry_run:
                print(f"[dry-run] rename: {entry.path} -> {target}")
            else:
                try:
                    os.rename(entry.path, target)
                    renamed += 1
                except OSError as e:
                    errors.append(f"rename {entry.path}: {e}")

    # 2) 把媒体文件搬进 main/
    media_files = []
    for entry in os.scandir(abs_dir):
        if not entry.is_file():
            continue
        if entry.name in {"README.md", "README.txt"} or entry.name.lower() == "readme.txt":
            continue
        if is_media(entry.name):
            media_files.append(Path(entry.path))

    if not media_files:
        return renamed, moved, errors

    main_dir = abs_dir / "main"
    if main_dir.exists() and not main_dir.is_dir():
        errors.append(f"{main_dir} exists but is not a directory, skipping move")
        return renamed, moved, errors

    if not main_dir.exists():
        if dry_run:
            print(f"[dry-run] mkdir: {main_dir}")
        else:
            try:
                main_dir.mkdir(parents=False, exist_ok=False)
            except OSError as e:
                errors.append(f"mkdir {main_dir}: {e}")
                return renamed, moved, errors

    # 媒体文件按数字感知排序后再搬，便于排查和回滚
    media_files.sort(key=lambda p: natural_sort_key(p.name))

    for src in media_files:
        dest = main_dir / src.name
        if dest.exists():
            if not overwrite_main:
                # 不覆盖；跳过
                if dry_run:
                    print(f"[skip] {src} -> {dest} (target exists; pass --overwrite-main to replace)")
                continue
            if dry_run:
                print(f"[dry-run] overwrite: {src} -> {dest}")
            else:
                try:
                    os.remove(dest)
                except OSError as e:
                    errors.append(f"remove existing {dest}: {e}")
                    continue
        if dry_run:
            print(f"[dry-run] move: {src} -> {dest}")
        else:
            try:
                shutil.move(str(src), str(dest))
                moved += 1
            except OSError as e:
                errors.append(f"move {src}: {e}")

    return renamed, moved, errors


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="把子目录的 README.txt 改成 README.md，并把媒体文件搬进 main/（独立工具，零依赖）。"
    )
    parser.add_argument("root", help="要处理的根目录")
    parser.add_argument("--dry-run", action="store_true", help="只打印将做的更改，不动文件")
    parser.add_argument(
        "--overwrite-main",
        action="store_true",
        help="目标 main/ 里已存在同名文件时覆盖",
    )
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: not a directory: {root}", file=sys.stderr)
        return 1

    total_renamed = 0
    total_moved = 0
    total_errors = 0
    for d in find_dirs(root):
        # 只在有 README.txt 或媒体文件的目录里做事，避免无意义输出
        if not has_media_in_dir(d) and not any(
            e.is_file() and e.name.lower() == "readme.txt" for e in os.scandir(d)
        ):
            continue
        renamed, moved, errors = normalize_one(d, args.dry_run, args.overwrite_main)
        total_renamed += renamed
        total_moved += moved
        total_errors += len(errors)
        for err in errors:
            print(f"[error] {d}: {err}", file=sys.stderr)

    print(
        f"\nDone. renamed={total_renamed} moved={total_moved} errors={total_errors}"
    )
    return 0 if total_errors == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
