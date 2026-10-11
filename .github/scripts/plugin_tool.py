#!/usr/bin/env python3
"""danoniplus-plugins 用: PRの検証 (check) と、マージ後の wiki / README 更新 (publish)。

PRのタイトル・本文などは、シェルへ展開せず環境変数で受け取る:
  PR_TITLE, PR_BODY, PR_AUTHOR, PR_URL, PR_MERGED_AT, REPO, BASE_REF
変更ファイル一覧は `status<TAB>filename` 形式のTSV
(`gh api repos/OWNER/REPO/pulls/N/files --paginate --jq '.[] | [.status, .filename] | @tsv'` の出力)。

標準ライブラリのみ使用。
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------- 設定

# PRテンプレート(.github/PULL_REQUEST_TEMPLATE.md)の見出し(## の後ろ)と完全一致させること。
# 概要と対応バージョンは README の一覧に使うため、コード内でも名前で参照する。
HEADING_OVERVIEW = "概要 / Overview"
HEADING_VERSIONS = "対応バージョン / Supported Versions"
REQUIRED_HEADINGS = [
    HEADING_OVERVIEW,
    HEADING_VERSIONS,
    "導入方法 / Installation",
    "設定項目 / Configuration",
    "注意点 / Notes",
    "スクリーンショット / Screenshots",
]
NON_EMPTY_HEADINGS = [HEADING_OVERVIEW, HEADING_VERSIONS]
HISTORY_HEADING = "更新履歴"

# 用途フォルダとして扱わないトップレベルディレクトリ(ドット始まりは常に除外)。
# 将来、用途フォルダ以外のディレクトリをルートに置く場合はここへ追加する。
IGNORED_DIRS: set[str] = set()

FOLDER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
TITLE_RE = re.compile(r"^\s*(?P<type>[A-Za-z]+)(?:\([^)]*\))?\s*:")

MARK_START = "<!-- CUSTOM-JS-LIST:START -->"
MARK_END = "<!-- CUSTOM-JS-LIST:END -->"

HEADERS = {
    "ja": (
        "| 用途名 | 種別 | 概要 | 対応バージョン | 作者 | 最終更新日 | 詳細 |",
        "|---|---|---|---|---|---|---|",
    ),
    "en": (
        "| Name | Type | Summary | Supported versions | Author | Last updated | Details |",
        "|---|---|---|---|---|---|---|",
    ),
}
COL_TYPE, COL_UPDATED = 1, 5  # 一覧表の列位置(0始まり)

JST = timezone(timedelta(hours=9))
ROW_NAME_RE = re.compile(r"^\|\s*\[(?P<name>[^\]]+)\]\(")


# ---------------------------------------------------------------- ログ出力

def log_error(msg: str) -> None:
    print(f"::error::{msg}")


def log_warning(msg: str) -> None:
    print(f"::warning::{msg}")


def write_summary(lines: list[str]) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------- PR解析

def read_files(path: str) -> list[tuple[str, str]]:
    files: list[tuple[str, str]] = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        status, _, name = line.partition("\t")
        files.append((status.strip(), name.strip()))
    return files


def plugin_folders(files: list[tuple[str, str]]) -> dict[str, list[str]]:
    """変更ファイルから用途フォルダ(トップレベルディレクトリ)を抽出し、ファイルのstatus一覧を返す。"""
    folders: dict[str, list[str]] = {}
    for status, name in files:
        if "/" not in name:
            continue  # ルート直下のファイル(README等)は対象外
        top = name.split("/", 1)[0]
        if top.startswith(".") or top in IGNORED_DIRS:
            continue
        folders.setdefault(top, []).append(status)
    return folders


def analyze_pr(title: str, files: list[tuple[str, str]]) -> dict:
    result: dict = {"kind": None, "is_add": False, "folder": None, "errors": []}
    errors: list[str] = result["errors"]

    m = TITLE_RE.match(title or "")
    if not m:
        errors.append("PRタイトルは `add: 説明` や `update: 説明` のように「種別:」で始めてください。")
        return result
    kind = m.group("type").lower()
    result["kind"] = kind

    folders = plugin_folders(files)
    for name in folders:
        if not FOLDER_RE.match(name):
            errors.append(f"フォルダ名 `{name}` は英数字と . _ - のみ使用できます。")

    if kind == "remove":
        errors.append("`remove:` は未対応です(削除経緯の記録方法が未決定)。")

    if len(folders) > 1:
        errors.append("1つのPRで変更できる用途フォルダは1つだけです: " + ", ".join(sorted(folders)))
    elif len(folders) == 1:
        result["folder"] = next(iter(folders))

    if kind == "add":
        result["is_add"] = True
        if not folders:
            errors.append("`add:` ですが、追加された用途フォルダが見つかりません。")
        elif len(folders) == 1 and any(s != "added" for s in folders[result["folder"]]):
            errors.append(
                f"`add:` ですが `{result['folder']}` は既存のフォルダです。更新なら `update:` などを使ってください。"
            )
    return result


# ---------------------------------------------------------------- PR本文の解析

def strip_comment(line: str, in_comment: bool) -> tuple[str, bool]:
    """1行からHTMLコメント(複数行にまたがるものを含む)を除去する。"""
    out: list[str] = []
    i = 0
    while i < len(line):
        if in_comment:
            j = line.find("-->", i)
            if j == -1:
                return "".join(out), True
            in_comment = False
            i = j + 3
        else:
            j = line.find("<!--", i)
            if j == -1:
                out.append(line[i:])
                break
            out.append(line[i:j])
            in_comment = True
            i = j + 4
    return "".join(out), in_comment


def parse_sections(body: str) -> tuple[dict[str, str], list[str]]:
    """本文を `## 見出し` ごとに分割する。コードフェンス内の `##` やコメントは見出しとして扱わない。

    コードフェンス内のHTMLコメント(導入方法のHTMLサンプル等)は除去せずそのまま残す。
    """
    sections: dict[str, list[str]] = {}
    dups: list[str] = []
    current: str | None = None
    in_fence = False
    fence = ""
    in_comment = False

    for raw in (body or "").replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if in_fence:
            closer = rf"{re.escape(fence[0])}{{{len(fence)},}}"
            if re.fullmatch(closer, raw.strip()):
                in_fence = False
            if current is not None:
                sections[current].append(raw)
            continue

        line, in_comment = strip_comment(raw, in_comment)

        m = re.match(r"^\s*(`{3,}|~{3,})", line)
        if m:
            in_fence = True
            fence = m.group(1)
            if current is not None:
                sections[current].append(line)
            continue

        h = re.match(r"^##\s+(\S.*?)\s*$", line)
        if h:
            current = h.group(1)
            if current in sections:
                dups.append(current)
            else:
                sections[current] = []
            continue

        if current is not None:
            sections[current].append(line)

    return {k: "\n".join(v).strip("\n") for k, v in sections.items()}, dups


def validate_body(sections: dict[str, str], dups: list[str]) -> list[str]:
    errors: list[str] = []
    missing = [h for h in REQUIRED_HEADINGS if h not in sections]
    if missing:
        errors.append("PR本文に次の見出しがありません: " + ", ".join(f"`## {h}`" for h in missing))
    for h in NON_EMPTY_HEADINGS:
        if h in sections and not sections[h].strip():
            errors.append(f"`## {h}` が空です。")
    if dups:
        errors.append("PR本文の見出しが重複しています: " + ", ".join(f"`## {h}`" for h in dups))
    return errors


# ---------------------------------------------------------------- 文字列ユーティリティ

def first_paragraph(text: str) -> str:
    lines: list[str] = []
    for line in (text or "").split("\n"):
        if not line.strip():
            if lines:
                break
            continue
        lines.append(line.strip())
    return " ".join(lines)


def first_line(text: str) -> str:
    for line in (text or "").split("\n"):
        s = line.strip()
        if s:
            return re.sub(r"^[-*+]\s+", "", s)
    return ""


def cell(text: str) -> str:
    return (text or "").replace("\n", " ").replace("|", "\\|").strip()


def escape_link_text(text: str) -> str:
    return re.sub(r"([\[\]])", r"\\\1", text.strip())


def folder_types(folder: str) -> str:
    p = Path(folder)
    if not p.is_dir():
        return "-"
    subs = sorted(d.name for d in p.iterdir() if d.is_dir() and not d.name.startswith("."))
    return ", ".join(subs) if subs else "-"


def merged_date() -> str:
    raw = os.environ.get("PR_MERGED_AT", "")
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(JST)
    except ValueError:
        dt = datetime.now(JST)
    return dt.strftime("%Y-%m-%d")


# ---------------------------------------------------------------- wiki

def history_entry(date: str, title: str, url: str) -> str:
    return f"- {date}: [{escape_link_text(title)}]({url})"


def build_wiki_page(folder: str, sections: dict[str, str], *, types: str, author: str,
                    date: str, title: str, url: str, repo: str, base_ref: str) -> str:
    meta = [f"種別: {types}"]
    if author:
        meta.append(f"作者: [@{author}](https://github.com/{author})")
    meta.append(f"[ソースコード](https://github.com/{repo}/tree/{base_ref}/{folder})")

    out = [f"# {folder}", "", "> " + " / ".join(meta), ""]
    for h in REQUIRED_HEADINGS:
        body = sections.get(h, "").strip() or "なし"
        out += [f"## {h}", "", body, ""]
    out += [f"## {HISTORY_HEADING}", "", history_entry(date, title, url)]
    return "\n".join(out) + "\n"


def append_history(page_text: str, entry: str) -> str:
    lines = page_text.rstrip("\n").split("\n")
    idx = None
    for i, line in enumerate(lines):
        if line.strip() == f"## {HISTORY_HEADING}":
            idx = i
    if idx is None:
        lines += ["", f"## {HISTORY_HEADING}", "", entry]
        return "\n".join(lines) + "\n"

    end = len(lines)
    for j in range(idx + 1, len(lines)):
        if re.match(r"^##\s", lines[j]):
            end = j
            break
    while end - 1 > idx and not lines[end - 1].strip():
        end -= 1
    lines.insert(end, entry)
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- README

def build_row(folder: str, *, summary: str, versions: str, types: str,
              author: str, date: str, repo: str) -> str:
    author_cell = f"[@{author}](https://github.com/{author})" if author else "-"
    cells = [
        f"[{folder}](./{folder})",
        cell(types) or "-",
        cell(summary) or "-",
        cell(versions) or "-",
        author_cell,
        date,
        f"[Wiki](https://github.com/{repo}/wiki/{folder})",
    ]
    return "| " + " | ".join(cells) + " |"


def split_row(row: str) -> list[str]:
    return [c.strip() for c in re.split(r"(?<!\\)\|", row.strip())[1:-1]]


def row_name(row: str) -> str | None:
    m = ROW_NAME_RE.match(row)
    return m.group("name") if m else None


def update_readme(path: str, lang: str, folder: str, *, new_row: str | None = None,
                  types: str = "-", date: str = "", replace_existing: bool = True) -> bool:
    """マーカー内の一覧表を更新する。new_row があれば追加/置換、なければ種別と最終更新日のみ更新。

    replace_existing=False のときは、既に行がある用途の new_row を反映せず、そのまま残す(手動翻訳などの保護)。
    """
    p = Path(path)
    if not p.exists():
        log_warning(f"{path} が見つからないため更新しません。")
        return False
    text = p.read_text(encoding="utf-8")
    s, e = text.find(MARK_START), text.find(MARK_END)
    if s == -1 or e == -1 or e < s:
        log_warning(f"{path} に {MARK_START} / {MARK_END} が見つからないため更新しません。")
        return False

    block = text[s + len(MARK_START):e]
    table = [ln.rstrip() for ln in block.split("\n") if ln.strip().startswith("|")]
    if len(table) >= 2 and re.fullmatch(r"\|[\s:\-|]+\|", table[1]):
        header, rows = table[:2], table[2:]
    else:
        header, rows = list(HEADERS[lang]), table

    idx = next((i for i, r in enumerate(rows) if row_name(r) == folder), None)
    if new_row is not None:
        if idx is None:
            rows.append(new_row)
        elif replace_existing:
            rows[idx] = new_row
        else:
            log_warning(f"{path} には `{folder}` の行が既にあるため、そのまま残します(手動編集の保護)。")
            return False
        rows.sort(key=lambda r: (row_name(r) or r).casefold())
    else:
        if idx is None:
            log_warning(f"{path} に `{folder}` の行がないため、最終更新日を更新できません。")
            return False
        cells = split_row(rows[idx])
        if len(cells) <= COL_UPDATED:
            log_warning(f"{path} の `{folder}` の行の列数が想定と異なるため更新しません。")
            return False
        cells[COL_TYPE] = cell(types) or "-"
        cells[COL_UPDATED] = date
        rows[idx] = "| " + " | ".join(cells) + " |"

    new_text = text[:s + len(MARK_START)] + "\n" + "\n".join(header + rows) + "\n" + text[e:]
    if new_text == text:
        return False
    p.write_text(new_text, encoding="utf-8")
    return True


# ---------------------------------------------------------------- サブコマンド

def pr_env() -> dict[str, str]:
    g = os.environ.get
    return {
        "title": g("PR_TITLE", ""),
        "body": g("PR_BODY", "") or "",
        "author": g("PR_AUTHOR", ""),
        "url": g("PR_URL", ""),
        "repo": g("REPO", ""),
        "base_ref": g("BASE_REF", "main"),
    }


def collect_errors(env: dict[str, str], files: list[tuple[str, str]]) -> tuple[dict, dict[str, str], list[str]]:
    info = analyze_pr(env["title"], files)
    errors = list(info["errors"])
    sections: dict[str, str] = {}
    if info["is_add"]:
        sections, dups = parse_sections(env["body"])
        errors += validate_body(sections, dups)
    return info, sections, errors


def report_errors(errors: list[str]) -> None:
    for msg in errors:
        log_error(msg)
    write_summary(["### PRの検証に失敗しました", ""] + [f"- {m}" for m in errors])


def cmd_check(args: argparse.Namespace) -> int:
    env = pr_env()
    info, _, errors = collect_errors(env, read_files(args.files))
    if errors:
        report_errors(errors)
        return 1

    if not info["folder"]:
        msg = "用途フォルダの変更がないため、マージ時の wiki / README 更新はありません。"
    elif info["is_add"]:
        msg = f"OK: 新規追加 `{info['folder']}` → マージ時に wiki ページと README(日本語/英語)を作成・追記します。"
    else:
        msg = f"OK: 更新 `{info['folder']}` → マージ時に wiki の更新履歴へ追記し、README の最終更新日を更新します。"
    print(msg)
    write_summary([f"### {msg}"])
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    env = pr_env()
    info, sections, errors = collect_errors(env, read_files(args.files))
    if errors:
        report_errors(errors)
        return 1

    folder = info["folder"]
    if not folder:
        print("用途フォルダの変更がないため、wiki / README は更新しません。")
        return 0

    date = merged_date()
    types = folder_types(folder)
    page = Path(args.wiki_dir) / f"{folder}.md"
    entry = history_entry(date, env["title"], env["url"])

    if info["is_add"]:
        if page.exists():
            log_warning(f"wikiに {page.name} が既にあるため上書きしません(手動編集の保護)。")
        else:
            page.write_text(
                build_wiki_page(folder, sections, types=types, author=env["author"], date=date,
                                title=env["title"], url=env["url"], repo=env["repo"],
                                base_ref=env["base_ref"]),
                encoding="utf-8",
            )
            print(f"wiki: {page.name} を作成しました。")

        # 英語READMEにも日本語の概要をそのまま載せる(翻訳は後でまとめて手動で行う)
        row = build_row(folder, summary=first_paragraph(sections.get(HEADING_OVERVIEW, "")),
                        versions=first_line(sections.get(HEADING_VERSIONS, "")), types=types,
                        author=env["author"], date=date, repo=env["repo"])
        for lang, path in (("ja", args.readme), ("en", args.readme_en)):
            changed = update_readme(path, lang, folder, new_row=row, replace_existing=False)
            print(f"{path}: {'更新' if changed else '変更なし/スキップ'}")
    else:
        if page.exists():
            text = page.read_text(encoding="utf-8")
            if f"]({env['url']})" in text:
                print("wiki: この PR の履歴は追記済みです。")
            else:
                page.write_text(append_history(text, entry), encoding="utf-8")
                print(f"wiki: {page.name} の更新履歴へ追記しました。")
        else:
            log_warning(f"wikiに {page.name} がないため、更新履歴のみの最小ページを作成します。")
            page.write_text(f"# {folder}\n\n## {HISTORY_HEADING}\n\n{entry}\n", encoding="utf-8")

        for lang, path in (("ja", args.readme), ("en", args.readme_en)):
            changed = update_readme(path, lang, folder, new_row=None, types=types, date=date)
            print(f"{path}: {'更新' if changed else '変更なし/スキップ'}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check", help="PRのタイトル・用途フォルダ・本文を検証する")
    c.add_argument("--files", required=True, help="変更ファイル一覧のTSV")
    c.set_defaults(func=cmd_check)

    p = sub.add_parser("publish", help="マージ後に wiki ページと README を更新する")
    p.add_argument("--files", required=True, help="変更ファイル一覧のTSV")
    p.add_argument("--wiki-dir", required=True, help="wiki リポジトリのチェックアウト先")
    p.add_argument("--readme", default="README.md")
    p.add_argument("--readme-en", default="README.en.md")
    p.set_defaults(func=cmd_publish)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
