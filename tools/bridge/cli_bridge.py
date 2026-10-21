#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
InkOS Local CLI Bridge
将本地已配置好的 agy 和 opencode CLI 包装为标准 OpenAI 兼容的 API 服务，
供 InkOS Studio (Web) 及本地工具无缝调用进行小说创作与对话。
支持真实 Token 级实时流式输出 (stream-json)，杜绝超时与连接中断。
"""

import os
import sys
import json
import time
import subprocess
import re
import queue
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

AGY_PATH = "/root/.local/bin/agy"
OPENCODE_PATH = "/root/.opencode/bin/opencode"

AVAILABLE_MODELS = [
    {"id": "gemini-3.8-flash-high", "name": "Gemini 3.8 Flash (High) - agy", "backend": "agy"},
    {"id": "gemini-3.8-flash-medium", "name": "Gemini 3.8 Flash (Medium) - agy", "backend": "agy"},
    {"id": "gemini-3.8-flash-low", "name": "Gemini 3.8 Flash (Low) - agy", "backend": "agy"},
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6 (Thinking) - agy", "backend": "agy"},
    {"id": "claude-opus-4-6-thinking", "name": "Claude Opus 4.6 (Thinking) - agy", "backend": "agy"},
    {"id": "gpt-oss-120b-medium", "name": "GPT-OSS 120B (Medium) - agy", "backend": "agy"},
    {"id": "opencode-default", "name": "OpenCode Default - opencode", "backend": "opencode"},
]

def format_messages_to_prompt(messages):
    parts = [
        "【写作系统核心准则】：你现在作为 InkOS 小说创作者与小说助手。严禁尝试调用任何操作系统命令、bash 或本地工具！请直接根据上下文设定与用户任务，以纯文本格式进行回复、构思或正文创作！\n"
    ]
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if not content:
            continue
        if role == "system":
            parts.append(f"【系统设定与写作要求】:\n{content}\n")
        elif role == "user":
            parts.append(f"【当前写作任务】:\n{content}\n")
        elif role == "assistant":
            parts.append(f"【已有上文】:\n{content}\n")
        else:
            parts.append(f"[{role}]:\n{content}\n")
    return "\n".join(parts)

def call_cli_backend_stream(prompt, model_id="gemini-3.8-flash-high"):
    """
    流式执行本地 CLI，实时 yield 生成的文本增量 (token/chunk)。
    """
    if "opencode" in model_id.lower():
        cmd = [OPENCODE_PATH, "run", prompt]
        try:
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
            for line in p.stdout:
                if line.startswith("> build"):
                    continue
                yield line
            p.wait()
            if p.returncode != 0 and p.stderr:
                err = p.stderr.read().strip()
                if err:
                    yield f"\n[OpenCode Error: {err}]"
        except Exception as e:
            yield f"[OpenCode 执行异常: {str(e)}]"
    else:
        valid_models = [m["id"] for m in AVAILABLE_MODELS if m["backend"] == "agy"]
        chosen_model = model_id if model_id in valid_models else "gemini-3.8-flash-medium"
        cmd = [
            AGY_PATH, "-p", prompt,
            "--model", chosen_model,
            "--disable-slash-commands",
            "--dangerously-skip-permissions",
            "--output-format", "stream-json"
        ]
        try:
            p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
            yielded_any = False
            last_response = ""

            for raw_line in p.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    evt = data.get("event")
                    if evt == "step_update":
                        su = data.get("step_update", {})
                        delta = su.get("text_delta")
                        if delta:
                            yielded_any = True
                            yield delta
                    elif evt == "result":
                        res = data.get("result", {})
                        last_response = res.get("response", "")
                except Exception:
                    continue

            p.wait()
            # 如果流式未能拿到 step_update 但最后有 result，兜底输出
            if not yielded_any and last_response:
                yield last_response
            elif not yielded_any:
                err = p.stderr.read().strip() if p.stderr else ""
                yield err or "创作完成。"
        except Exception as e:
            yield f"[AGY 执行异常: {str(e)}]"

def call_cli_backend(prompt, model_id="gemini-3.8-flash-high"):
    chunks = list(call_cli_backend_stream(prompt, model_id=model_id))
    return "".join(chunks).strip() or "创作完成。"

class OpenAIApiHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path in ("/v1/models", "/models"):
            models_data = {
                "object": "list",
                "data": [
                    {
                        "id": m["id"],
                        "object": "model",
                        "created": 1729410000,
                        "owned_by": m["backend"],
                        "root": m["id"]
                    }
                    for m in AVAILABLE_MODELS
                ]
            }
            body = json.dumps(models_data, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path in ("", "/", "/health", "/v1/health"):
            body = json.dumps({"status": "ok", "service": "InkOS Local CLI Bridge"}).encode("utf-8")
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        self.send_error(404, "Not Found")

    def do_POST(self):
        path = self.path.split("?")[0].rstrip("/")
        content_len = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_len).decode('utf-8')
        try:
            data = json.loads(body) if body else {}
        except Exception:
            data = {}

        if path in ("/v1/chat/completions", "/chat/completions"):
            messages = data.get("messages", [])
            model = data.get("model", "gemini-3.8-flash-high")
            stream = data.get("stream", False)

            prompt = format_messages_to_prompt(messages)
            if not prompt.strip():
                prompt = "请回复OK。"

            created_time = int(time.time())
            cmpl_id = f"chatcmpl-local-cli-{created_time}"

            if stream:
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache, no-transform")
                self.send_header("X-Accel-Buffering", "no")
                self.send_header("Connection", "close")
                self.end_headers()

                # 快速探活
                if len(prompt.strip()) < 15 and "ok" in prompt.lower():
                    chunk_text = "OK"
                    chunk = {
                        "id": cmpl_id,
                        "object": "chat.completion.chunk",
                        "created": created_time,
                        "model": model,
                        "choices": [{"index": 0, "delta": {"content": chunk_text}, "finish_reason": None}]
                    }
                    self.wfile.write(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode("utf-8"))
                    self.wfile.flush()
                else:
                    # 真实实时流式投递
                    try:
                        for chunk_text in call_cli_backend_stream(prompt, model_id=model):
                            if not chunk_text:
                                continue
                            chunk = {
                                "id": cmpl_id,
                                "object": "chat.completion.chunk",
                                "created": int(time.time()),
                                "model": model,
                                "choices": [
                                    {
                                        "index": 0,
                                        "delta": {"content": chunk_text},
                                        "finish_reason": None
                                    }
                                ]
                            }
                            self.wfile.write(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n".encode("utf-8"))
                            self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        return
                    except Exception as e:
                        err_chunk = {
                            "id": cmpl_id,
                            "object": "chat.completion.chunk",
                            "created": int(time.time()),
                            "model": model,
                            "choices": [{"index": 0, "delta": {"content": f"\n[Bridge Error: {str(e)}]"}, "finish_reason": None}]
                        }
                        try:
                            self.wfile.write(f"data: {json.dumps(err_chunk, ensure_ascii=False)}\n\n".encode("utf-8"))
                            self.wfile.flush()
                        except Exception:
                            pass

                # 结束标志
                stop_chunk = {
                    "id": cmpl_id,
                    "object": "chat.completion.chunk",
                    "created": int(time.time()),
                    "model": model,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
                }
                try:
                    self.wfile.write(f"data: {json.dumps(stop_chunk, ensure_ascii=False)}\n\n".encode("utf-8"))
                    self.wfile.write(b"data: [DONE]\n\n")
                    self.wfile.flush()
                except Exception:
                    pass
                self.close_connection = True
                return
            else:
                if len(prompt.strip()) < 15 and "ok" in prompt.lower():
                    response_text = "OK"
                else:
                    response_text = call_cli_backend(prompt, model_id=model)

                resp = {
                    "id": cmpl_id,
                    "object": "chat.completion",
                    "created": created_time,
                    "model": model,
                    "choices": [
                        {
                            "index": 0,
                            "message": {
                                "role": "assistant",
                                "content": response_text
                            },
                            "finish_reason": "stop"
                        }
                    ],
                    "usage": {
                        "prompt_tokens": len(prompt),
                        "completion_tokens": len(response_text),
                        "total_tokens": len(prompt) + len(response_text)
                    }
                }
                body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

        self.send_error(404, "Not Found")

def run(port=9099):
    server = ThreadingHTTPServer(("0.0.0.0", port), OpenAIApiHandler)
    print(f"InkOS Local CLI Bridge (Streaming & Multi-threaded) running on http://0.0.0.0:{port}")
    server.serve_forever()

if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else 9099
    run(p)
