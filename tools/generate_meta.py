#!/usr/bin/env python3
"""
generate_meta.py
================

独立工具，零依赖（只用 Python 标准库）。扫描一个目录树，对每个含媒体
文件但缺少 meta.json 的子目录生成一个 meta.json，格式与 LewdLand 扫描
器一致。

布局约定（与扫描器期望的格式一致）::

    <root>/
        <chat>-<messageId>/
            main/        （可选）-> 文件归到 main_files
            comments/    （可选）-> 文件归到 comment_files
            README.md    （可选）-> 解析 title / description / tags
            <files>      （兜底） -> 文件归到 main_files

用法::

    python tools/generate_meta.py <root-dir> [--dry-run] [--overwrite]
    python tools/generate_meta.py <root-dir> -h
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import List, Optional

IMAGE_EXTS = {
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "heic", "heif", "tif", "tiff",
}
VIDEO_EXTS = {
    "mp4", "mkv", "webm", "mov", "avi", "flv", "m4v", "ts", "wmv", "m2ts", "3gp",
}
MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS


def is_media(name: str) -> bool:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return ext in MEDIA_EXTS


def natural_sort_key(name: str):
    """按文件名做数字感知排序，避免 1.jpg / 10.jpg / 2.jpg 这种乱序。"""
    return [int(tok) if tok.isdigit() else tok.lower() for tok in re.split(r"(\d+)", name)]


def pick_media(files: List[str]) -> List[str]:
    return sorted([f for f in files if is_media(f)], key=natural_sort_key)


# --------------------------------------------------------------------- README


def parse_readme(text: str) -> dict:
    """提取 publish_date / source_chat / message_id / tags / title / description。"""
    out = {
        "title": "",
        "description": "",
        "tags": [],
        "tags_text": "",
        "publish_date": None,
        "source_chat": None,
        "message_id": None,
    }
    if not text:
        return out

    m = re.search(r"Published at \(UTC\):\s*`([^`]+)`", text)
    if m:
        out["publish_date"] = m.group(1).strip()
    m = re.search(r"Source chat:\s*`([^`]+)`", text)
    if m:
        out["source_chat"] = m.group(1).strip()
    m = re.search(r"Original message ID:\s*`(\d+)`", text)
    if m:
        out["message_id"] = int(m.group(1))

    desc_start = text.find("## Description")
    desc_section = ""
    if desc_start >= 0:
        after = desc_start + len("## Description")
        files_idx = text.find("## Files", after)
        desc_section = text[after:files_idx] if files_idx >= 0 else text[after:]

    tag_re = re.compile(r"#([^\s#`]+)")
    tags = sorted(set(tag_re.findall(desc_section)))
    out["tags"] = tags
    out["tags_text"] = " ".join("#" + t for t in tags)

    lines = []
    for line in desc_section.splitlines():
        cleaned = tag_re.sub("", line).strip()
        if cleaned:
            lines.append(cleaned)
    out["title"] = lines[0] if lines else ""
    out["description"] = "\n".join(lines).strip()
    return out


# --------------------------------------------------------------------- core


def build_meta(abs_dir: Path) -> dict:
    """根据目录内容构造 meta dict。"""
    files: List[str] = []
    dirs: List[str] = []
    for entry in os.scandir(abs_dir):
        if entry.is_file():
            files.append(entry.name)
        elif entry.is_dir():
            dirs.append(entry.name)
            # record the path so we can pass it to os.scandir later

    main_files: List[str] = []
    comment_files: List[str] = []

    if "main" in dirs:
        main_files = pick_media([e.name for e in os.scandir(abs_dir / "main") if e.is_file()])

    if "comments" in dirs:
        comment_files = pick_media([e.name for e in os.scandir(abs_dir / "comments") if e.is_file()])

    # 兜底：顶层媒体文件归到 main_files
    if not main_files and not comment_files:
        main_files = pick_media(files)

    meta: dict = {}
    if "README.md" in files:
        try:
            readme = parse_readme((abs_dir / "README.md").read_text(encoding="utf-8"))
        except OSError:
            readme = {}
        if readme.get("title"):
            meta["title"] = readme["title"]
        if readme.get("description"):
            meta["description"] = readme["description"]
        if readme.get("source_chat"):
            meta["source_chat"] = readme["source_chat"]
        if readme.get("message_id") is not None:
            meta["message_id"] = readme["message_id"]
        if readme.get("publish_date"):
            meta["publish_date"] = readme["publish_date"]
        if readme.get("tags_text"):
            meta["tags_text"] = readme["tags_text"]
        if readme.get("tags"):
            meta["tags"] = readme["tags"]

    meta["main_files"] = main_files
    meta["comment_files"] = comment_files
    return meta


def find_candidates(root: Path, overwrite: bool) -> List[Path]:
    """广度优先遍历，找出所有应该拥有 meta.json 的目录。"""
    candidates: List[Path] = []
    stack: List[Path] = [root]
    while stack:
        cur = stack.pop()
        try:
            entries = list(os.scandir(cur))
        except OSError as e:
            print(f"[warn] list failed: {cur} -> {e}", file=sys.stderr)
            continue

        files = {e.name for e in entries if e.is_file()}
        dirs = [e for e in entries if e.is_dir()]

        if "meta.json" in files and not overwrite:
            continue  # 已存在，跳过（不递归到消息文件夹内部）

        top_level_media = pick_media([e.name for e in entries if e.is_file()])
        has_structured = any(d.name in ("main", "comments") for d in dirs)
        if top_level_media or has_structured:
            candidates.append(cur)
            continue  # 消息文件夹：不递归内部

        stack.extend(Path(d.path) for d in dirs)
    return candidates


def process(root: Path, dry_run: bool, overwrite: bool) -> None:
    candidates = find_candidates(root, overwrite=overwrite)
    generated = 0
    skipped = 0
    for d in candidates:
        meta_path = d / "meta.json"
        if meta_path.exists() and not overwrite:
            print(f"[skip] {d} (meta.json exists; pass --overwrite to regenerate)")
            skipped += 1
            continue
        try:
            meta = build_meta(d)
        except Exception as e:  # noqa: BLE001
            print(f"[warn] build failed: {d} -> {e}", file=sys.stderr)
            skipped += 1
            continue

        if not meta["main_files"] and not meta["comment_files"]:
            print(f"[skip] {d} (no media)")
            skipped += 1
            continue

        body = json.dumps(meta, ensure_ascii=False, indent=2) + "\n"
        if dry_run:
            print(f"[dry-run] {d}:")
            print(body)
        else:
            try:
                meta_path.write_text(body, encoding="utf-8")
            except OSError as e:
                print(f"[error] write failed: {d} -> {e}", file=sys.stderr)
                skipped += 1
                continue
            print(f"[write] {meta_path}")
            generated += 1

    print(f"\nDone. candidates={len(candidates)} generated={generated} skipped={skipped}")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="为每个含媒体文件的子目录生成 meta.json（独立工具，零依赖）。"
    )
    parser.add_argument("root", help="要扫描的根目录")
    parser.add_argument("--dry-run", action="store_true", help="只打印将生成的内容，不写文件")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="即使 meta.json 已存在也重新生成",
    )
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: not a directory: {root}", file=sys.stderr)
        return 1

    process(root, dry_run=args.dry_run, overwrite=args.overwrite)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
