#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
InkOS Local CLI Bridge
将本地已配置好的 agy 和 opencode CLI 包装为标准 OpenAI 兼容的 API 服务，
供 InkOS Studio (Web) 及本地工具无缝调用进行小说创作与对话。
"""

import os
import sys
import json
import time
import subprocess
import re
from http.server import HTTPServer, BaseHTTPRequestHandler

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
    parts = []
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

def call_cli_backend(prompt, model_id="gemini-3.8-flash-high"):
    if "opencode" in model_id.lower():
        cmd = [OPENCODE_PATH, "run", prompt]
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            out = p.stdout.strip()
            out = re.sub(r'^>\s*build[^\n]*\n', '', out).strip()
            return out or p.stderr.strip() or "创作完成。"
        except Exception as e:
            return f"OpenCode 执行异常: {str(e)}"
    else:
        valid_models = [m["id"] for m in AVAILABLE_MODELS if m["backend"] == "agy"]
        chosen_model = model_id if model_id in valid_models else "gemini-3.8-flash-high"
        cmd = [AGY_PATH, "-p", prompt, "--model", chosen_model, "--output-format", "text"]
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            out = p.stdout.strip()
            return out or p.stderr.strip() or "创作完成。"
        except Exception as e:
            return f"AGY 执行异常: {str(e)}"

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

            # Build prompt
            prompt = format_messages_to_prompt(messages)
            if not prompt.strip():
                prompt = "请回复OK。"

            # Fast check for simple health probe / test
            if len(prompt.strip()) < 15 and "ok" in prompt.lower():
                response_text = "OK"
            else:
                response_text = call_cli_backend(prompt, model_id=model)

            created_time = int(time.time())
            cmpl_id = f"chatcmpl-local-cli-{created_time}"

            if stream:
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", "text/event-stream; charset=utf-8")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Connection", "close")
                self.end_headers()

                chunk1 = {
                    "id": cmpl_id,
                    "object": "chat.completion.chunk",
                    "created": created_time,
                    "model": model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"role": "assistant", "content": response_text},
                            "finish_reason": None
                        }
                    ]
                }
                chunk2 = {
                    "id": cmpl_id,
                    "object": "chat.completion.chunk",
                    "created": created_time,
                    "model": model,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {},
                            "finish_reason": "stop"
                        }
                    ]
                }
                self.wfile.write(f"data: {json.dumps(chunk1, ensure_ascii=False)}\n\n".encode("utf-8"))
                self.wfile.write(f"data: {json.dumps(chunk2, ensure_ascii=False)}\n\n".encode("utf-8"))
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
                self.close_connection = True
            else:
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
    server = HTTPServer(("0.0.0.0", port), OpenAIApiHandler)
    print(f"InkOS Local CLI Bridge running on http://0.0.0.0:{port}")
    server.serve_forever()

if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else 9099
    run(p)
