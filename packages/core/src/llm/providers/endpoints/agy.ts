/**
 * 本地 CLI (agy / opencode) 端点配置
 *
 * 通过本地 CLI Bridge (http://127.0.0.1:9099/v1) 直接调用本地已授权的 CLI：
 * - agy (Gemini 3.8 Flash, Claude Sonnet 4.6, Claude Opus 4.6, GPT-OSS 120B)
 * - opencode (OpenCode Default)
 */
import type { InkosEndpoint } from "../types.js";

export const AGY: InkosEndpoint = {
  id: "agy",
  label: "本地 CLI (agy / opencode)",
  group: "local",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1:9099/v1",
  modelsBaseUrl: "http://127.0.0.1:9099/v1",
  checkModel: "gemini-3.8-flash-high",
  models: [
    { id: "gemini-3.8-flash-high", maxOutput: 8192, contextWindowTokens: 1048576 },
    { id: "gemini-3.8-flash-medium", maxOutput: 8192, contextWindowTokens: 1048576 },
    { id: "gemini-3.8-flash-low", maxOutput: 8192, contextWindowTokens: 1048576 },
    { id: "claude-sonnet-4-6", maxOutput: 8192, contextWindowTokens: 200000 },
    { id: "claude-opus-4-6-thinking", maxOutput: 8192, contextWindowTokens: 200000 },
    { id: "gpt-oss-120b-medium", maxOutput: 8192, contextWindowTokens: 131072 },
    { id: "opencode-default", maxOutput: 8192, contextWindowTokens: 131072 },
  ],
};
