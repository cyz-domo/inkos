#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
InkOS 小说工作台控制面板服务器
提供：
- 小说展示与章节阅读修改
- AI 剧情大纲交流
- 章节区间标准小说格式导出
- 本地 CLI / 大模型 API Key 自由切换与任务控制
"""

import os
import sys
import json
import re
import subprocess
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime

DIR_PATH = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.abspath(os.path.join(DIR_PATH, ".."))
BOOKS_DIR = os.path.join(BASE_DIR, "books")
EXPORTS_DIR = os.path.join(BASE_DIR, "exports")
CONFIG_PATH = os.path.join(DIR_PATH, "config.json")
INDEX_HTML_PATH = os.path.join(DIR_PATH, "index.html")

os.makedirs(EXPORTS_DIR, exist_ok=True)

DEFAULT_CONFIG = {
    "runner_mode": "cli",
    "api_base_url": "https://api.deepseek.com/v1",
    "api_key": "",
    "model_name": "deepseek-chat",
    "temperature": 0.7
}

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                return {**DEFAULT_CONFIG, **cfg}
        except Exception:
            pass
    return DEFAULT_CONFIG.copy()

def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

def get_books_list():
    books = []
    if not os.path.exists(BOOKS_DIR):
        return books
    for entry in sorted(os.listdir(BOOKS_DIR)):
        bdir = os.path.join(BOOKS_DIR, entry)
        if not os.path.isdir(bdir):
            continue
        book_json = os.path.join(bdir, "book.json")
        meta = {}
        if os.path.exists(book_json):
            try:
                with open(book_json, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                pass

        chapters_dir = os.path.join(bdir, "chapters")
        ch_count = 0
        total_words = 0
        if os.path.exists(chapters_dir):
            for cf in os.listdir(chapters_dir):
                if re.match(r'chapter-\d+\.md', cf) or re.match(r'^\d+.*\.md', cf):
                    ch_count += 1
                    try:
                        with open(os.path.join(chapters_dir, cf), "r", encoding="utf-8") as f:
                            total_words += len(re.sub(r'\s+', '', f.read()))
                    except Exception:
                        pass

        books.append({
            "id": entry,
            "title": meta.get("title", entry),
            "genre": meta.get("genre", "其他"),
            "platform": meta.get("platform", "tomato"),
            "status": meta.get("status", "active"),
            "targetChapters": meta.get("targetChapters", 200),
            "chapterCount": ch_count,
            "totalWords": total_words,
            "updatedAt": meta.get("updatedAt", "")
        })
    return books

def get_book_details(book_id):
    bdir = os.path.join(BOOKS_DIR, book_id)
    if not os.path.exists(bdir):
        return None

    meta = {}
    bj = os.path.join(bdir, "book.json")
    if os.path.exists(bj):
        with open(bj, "r", encoding="utf-8") as f:
            meta = json.load(f)

    characters = []
    chardir = os.path.join(bdir, "characters")
    if os.path.exists(chardir):
        for cf in sorted(os.listdir(chardir)):
            if cf.endswith(".md"):
                cname = cf[:-3]
                try:
                    with open(os.path.join(chardir, cf), "r", encoding="utf-8") as f:
                        characters.append({"id": cname, "name": cname, "content": f.read()})
                except Exception:
                    pass

    world_text = ""
    wfile = os.path.join(bdir, "worldbuilding", "world-rules.md")
    if os.path.exists(wfile):
        with open(wfile, "r", encoding="utf-8") as f:
            world_text = f.read()

    foundation_text = ""
    ffile = os.path.join(bdir, "foundation", "foundation.md")
    if os.path.exists(ffile):
        with open(ffile, "r", encoding="utf-8") as f:
            foundation_text = f.read()

    readme_text = ""
    rfile = os.path.join(bdir, "README.txt")
    if os.path.exists(rfile):
        with open(rfile, "r", encoding="utf-8") as f:
            readme_text = f.read()

    return {
        "id": book_id,
        "title": meta.get("title", book_id),
        "genre": meta.get("genre", "都市末日"),
        "platform": meta.get("platform", "tomato"),
        "status": meta.get("status", "active"),
        "targetChapters": meta.get("targetChapters", 200),
        "characters": characters,
        "worldbuilding": world_text,
        "foundation": foundation_text,
        "readme": readme_text
    }

def get_chapters(book_id):
    bdir = os.path.join(BOOKS_DIR, book_id)
    chapters_dir = os.path.join(bdir, "chapters")
    if not os.path.exists(chapters_dir):
        return []

    index_file = os.path.join(chapters_dir, "index.json")
    if os.path.exists(index_file):
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    chapters = []
    for fname in sorted(os.listdir(chapters_dir)):
        m = re.match(r'chapter-(\d+)\.md', fname) or re.match(r'^(\d+)[_-]?(.*)\.md', fname)
        if not m:
            continue
        num = int(m.group(1))
        fpath = os.path.join(chapters_dir, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
        first_line = content.split('\n')[0].strip()
        title_match = re.search(r'第[0-9一二三四五六七八九十百]+章[：:\s]*(.*)', first_line)
        title = title_match.group(1).strip() if title_match else first_line.lstrip('#').strip()
        chapters.append({
            "number": num,
            "title": title or f"第{num}章",
            "fileName": fname,
            "wordCount": len(re.sub(r'\s+', '', content))
        })
    chapters.sort(key=lambda x: x["number"])
    return chapters

def get_chapter_content(book_id, num):
    bdir = os.path.join(BOOKS_DIR, book_id)
    chapters_dir = os.path.join(bdir, "chapters")
    if not os.path.exists(chapters_dir):
        return None, None

    for fn in os.listdir(chapters_dir):
        m = re.match(r'chapter-(\d+)\.md', fn) or re.match(r'^(\d+)[_-]?', fn)
        if m and int(m.group(1)) == num:
            fpath = os.path.join(chapters_dir, fn)
            with open(fpath, "r", encoding="utf-8") as f:
                return f.read(), fn
    return None, None

def save_chapter_content(book_id, num, content, title=None):
    bdir = os.path.join(BOOKS_DIR, book_id)
    chapters_dir = os.path.join(bdir, "chapters")
    os.makedirs(chapters_dir, exist_ok=True)
    fname = f"chapter-{num:03d}.md"
    fpath = os.path.join(chapters_dir, fname)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(content)

    index_file = os.path.join(chapters_dir, "index.json")
    chapters = get_chapters(book_id)
    found = False
    word_count = len(re.sub(r'\s+', '', content))
    t = title or f"第{num}章"
    for c in chapters:
        if c["number"] == num:
            c["wordCount"] = word_count
            if title:
                c["title"] = title
            found = True
            break
    if not found:
        chapters.append({
            "number": num,
            "title": t,
            "wordCount": word_count,
            "status": "approved"
        })
        chapters.sort(key=lambda x: x["number"])
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(chapters, f, ensure_ascii=False, indent=2)

def generate_export_text(book_id, start_num, end_num, fmt="txt", include_intro=True, indent=True):
    details = get_book_details(book_id)
    if not details:
        return "Book not found"

    title = details.get("title", book_id)
    chapters = get_chapters(book_id)
    selected_chapters = [c for c in chapters if start_num <= c["number"] <= end_num]

    lines = []
    if fmt == "txt":
        lines.append(f"《{title}》")
        lines.append(f"导出范围：第{start_num}章 至 第{end_num}章（共 {len(selected_chapters)} 章）")
        lines.append(f"导出时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("=" * 48)

        if include_intro:
            intro = details.get("readme", "")
            if not intro:
                intro = details.get("foundation", "")[:500]
            if intro:
                lines.append("【作品概述与核心设定】")
                for il in intro.strip().split('\n')[:35]:
                    lines.append(il)
                lines.append("=" * 48)
        lines.append("")

        for c in selected_chapters:
            num = c["number"]
            ch_title = c["title"]
            content, _ = get_chapter_content(book_id, num)
            if not content:
                continue

            lines.append(f"第{num}章 {ch_title}")
            lines.append("")

            raw_lines = content.split('\n')
            if raw_lines and raw_lines[0].strip().startswith('#'):
                raw_lines = raw_lines[1:]

            for l in raw_lines:
                cl = l.strip()
                if not cl:
                    continue
                cl = re.sub(r'^[#*>\-\s]+', '', cl)
                if cl:
                    if indent:
                        lines.append(f"\u3000\u3000{cl}")
                    else:
                        lines.append(cl)
                    lines.append("")
            lines.append("-" * 36)
            lines.append("")
    else:
        lines.append(f"# {title}\n")
        lines.append(f"> 导出范围：第{start_num}章 至 第{end_num}章 | 导出时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n---\n")
        if include_intro and details.get("readme"):
            lines.append("## 核心设定\n")
            lines.append(details.get("readme")[:1200] + "\n\n---\n")

        for c in selected_chapters:
            num = c["number"]
            ch_title = c["title"]
            content, _ = get_chapter_content(book_id, num)
            if not content:
                continue
            lines.append(f"## 第{num}章 {ch_title}\n")
            raw_lines = content.split('\n')
            if raw_lines and raw_lines[0].strip().startswith('#'):
                raw_lines = raw_lines[1:]
            lines.append("\n".join(raw_lines) + "\n\n---\n")

    return "\n".join(lines)

def call_llm_api(messages, config, system_prompt="你是一位资深的网文小说主笔与剧情策划。"):
    base_url = config.get("api_base_url", "https://api.deepseek.com/v1").rstrip("/")
    api_key = config.get("api_key", "")
    model = config.get("model_name", "deepseek-chat")

    if not api_key:
        return "【提示】：尚未配置 API Key，请在「执行者与模型设置」面板填入您的 API Key（如 DeepSeek、Kimi、OpenAI 等）后使用此功能。"

    url = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system_prompt}] + messages,
        "temperature": config.get("temperature", 0.7)
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        return f"【API 请求失败 HTTP {e.code}】: {err}"
    except Exception as e:
        return f"【请求异常】: {str(e)}"

class DashboardHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path in ("/", "/index.html"):
            if os.path.exists(INDEX_HTML_PATH):
                with open(INDEX_HTML_PATH, "r", encoding="utf-8") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(content.encode("utf-8"))
            else:
                self.send_error(404, "index.html not found")
            return

        if path == "/api/books":
            self._send_json(get_books_list())
            return

        if path.startswith("/api/books/") and path.endswith("/chapters"):
            book_id = path.split("/")[3]
            self._send_json(get_chapters(book_id))
            return

        m_ch = re.match(r'^/api/books/([^/]+)/chapters/(\d+)$', path)
        if m_ch:
            book_id = m_ch.group(1)
            num = int(m_ch.group(2))
            content, fname = get_chapter_content(book_id, num)
            self._send_json({"number": num, "fileName": fname, "content": content or ""})
            return

        m_exp = re.match(r'^/api/books/([^/]+)/export$', path)
        if m_exp:
            book_id = m_exp.group(1)
            start_num = int(query.get("start", [1])[0])
            end_num = int(query.get("end", [50])[0])
            fmt = query.get("format", ["txt"])[0]
            indent = query.get("indent", ["true"])[0] == "true"
            intro = query.get("intro", ["true"])[0] == "true"

            export_data = generate_export_text(book_id, start_num, end_num, fmt=fmt, include_intro=intro, indent=indent)
            filename = f"{book_id}_ch{start_num}-{end_num}.{fmt}"

            # Also save a copy to /data/novels/exports/
            export_file_path = os.path.join(EXPORTS_DIR, filename)
            with open(export_file_path, "w", encoding="utf-8") as f:
                f.write(export_data)

            self.send_response(200)
            self.send_header("Content-Type", f"text/{'plain' if fmt=='txt' else 'markdown'}; charset=utf-8")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.end_headers()
            self.wfile.write(export_data.encode("utf-8"))
            return

        m_details = re.match(r'^/api/books/([^/]+)$', path)
        if m_details:
            book_id = m_details.group(1)
            self._send_json(get_book_details(book_id) or {})
            return

        if path == "/api/config":
            self._send_json(load_config())
            return

        self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        content_len = int(self.headers.get('Content-Length', 0))
        post_body = self.rfile.read(content_len).decode('utf-8')
        data = json.loads(post_body) if post_body else {}

        if path == "/api/config":
            cfg = load_config()
            cfg.update(data)
            save_config(cfg)
            self._send_json({"ok": True, "config": cfg})
            return

        m_ch_save = re.match(r'^/api/books/([^/]+)/chapters/(\d+)$', path)
        if m_ch_save:
            book_id = m_ch_save.group(1)
            num = int(m_ch_save.group(2))
            save_chapter_content(book_id, num, data.get("content", ""), data.get("title"))
            self._send_json({"ok": True})
            return

        if path == "/api/execute":
            book_id = data.get("book_id", "doomsday-tycoon")
            action = data.get("action", "status")
            cmd = []
            if action == "write_next":
                cmd = ["inkos", "write", "next", book_id, "--count", "1"]
            elif action == "review":
                cmd = ["inkos", "review", book_id]
            elif action == "doctor":
                cmd = ["inkos", "doctor"]
            else:
                cmd = ["inkos", "status", book_id]

            try:
                p = subprocess.run(cmd, cwd=BASE_DIR, capture_output=True, text=True, timeout=180)
                out = p.stdout + ("\n" + p.stderr if p.stderr else "")
                self._send_json({"ok": True, "output": out})
            except Exception as e:
                self._send_json({"ok": False, "error": str(e)})
            return

        if path == "/api/chat":
            book_id = data.get("book_id", "doomsday-tycoon")
            user_msg = data.get("message", "")
            cfg = load_config()

            details = get_book_details(book_id)
            sys_context = f"你是一位专业的小说写作助手与策划指导。当前小说：《{details.get('title')}》，类型：{details.get('genre')}。\n主角设定：陈野，末日爆发前30天重生激活囤货系统，建立江城物流园方舟基地。\n核心人物包括周建国（安全）、吴小刚（技术）、林晚晴（医疗）、苏晓晓（后勤）。请与作者一同探讨剧情走向、伏笔设计与章节规划。"

            if cfg.get("api_key"):
                reply = call_llm_api([{"role": "user", "content": user_msg}], cfg, system_prompt=sys_context)
            else:
                reply = f"【当前为本地知识库策划模式（配置 API Key 后可直连 DeepSeek/Kimi 等大模型）】\n收到您的构思：『{user_msg}』。\n根据《末日神豪》当前 160 章的剧情现状：\n1. 剧情节点：江城地下方舟基地的关键信息已被张远与李明解密，下一阶段需应对『北方幸存者联盟』的大规模推进；\n2. 伏笔建议：可让周建国在防线外围截获带有赵天豪暗号的通讯信标，引出深层博弈；\n3. 任务推荐：可前往「自由章节切片导出」导出前 50 章或 101-160 章进行分卷整理！"

            self._send_json({"reply": reply})
            return

        self.send_error(404, "Not Found")

    def _send_json(self, obj):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode("utf-8"))

def run_server(port=8080):
    server = HTTPServer(("0.0.0.0", port), DashboardHandler)
    print(f"InkOS Novel Studio Dashboard started at http://0.0.0.0:{port}")
    server.serve_forever()

if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run_server(p)
