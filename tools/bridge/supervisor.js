// InkOS Local CLI Bridge Supervisor
// 自动守护、健康检查、自愈重启与 API 支撑

import { spawn, execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync, openSync } from "node:fs";
import { resolve } from "node:path";

const BRIDGE_SCRIPT = "/data/novels/bridge/cli_bridge.py";
const BRIDGE_PORT = 9099;
const BRIDGE_LOG = "/data/novels/bridge/bridge.log";
const ENV_FILE = "/data/novels/.env";
const ROOT_ENV_FILE = "/root/.inkos/.env";

export const AVAILABLE_MODELS = [
    { id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium) - 极速平衡推荐 (5~6秒)", backend: "agy" },
    { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High) - 深度思考 (60~90秒)", backend: "agy" },
    { id: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low) - 极速轻量 (3~4秒)", backend: "agy" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking) - 深度推演", backend: "agy" },
    { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking) - 顶级思考", backend: "agy" },
    { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)", backend: "agy" },
    { id: "opencode-default", name: "OpenCode Default - 本地开源底座", backend: "opencode" }
];

let bridgeProcess = null;
let supervisorTimer = null;
let lastStartTime = Date.now();
let isRestarting = false;

export function getCurrentModel() {
    try {
        if (existsSync(ENV_FILE)) {
            const content = readFileSync(ENV_FILE, "utf-8");
            const match = content.match(/INKOS_LLM_MODEL=([^\r\n]+)/);
            if (match) return match[1].trim();
        }
    } catch {}
    return "gemini-3.8-flash-medium";
}

export async function setCurrentModel(modelId) {
    const updateFile = async (filePath) => {
        try {
            if (!existsSync(filePath)) return;
            let content = await readFile(filePath, "utf-8");
            if (/INKOS_LLM_MODEL=/.test(content)) {
                content = content.replace(/INKOS_LLM_MODEL=[^\r\n]+/, `INKOS_LLM_MODEL=${modelId}`);
            } else {
                content += `\nINKOS_LLM_MODEL=${modelId}\n`;
            }
            await writeFile(filePath, content, "utf-8");
        } catch (e) {
            console.error(`Failed to write model to ${filePath}:`, e);
        }
    };
    await updateFile(ENV_FILE);
    await updateFile(ROOT_ENV_FILE);
    process.env.INKOS_LLM_MODEL = modelId;
}

export async function checkBridgeHealth() {
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
            return { online: true, latencyMs: Date.now() - startTime };
        }
    } catch {}
    return { online: false, latencyMs: -1 };
}

export function killExistingBridge() {
    try {
        execSync(`pkill -f "cli_bridge.py" 2>/dev/null || true`);
    } catch {}
    bridgeProcess = null;
}

export function startBridge() {
    killExistingBridge();
    console.log(`[Supervisor] Spawning CLI Bridge on port ${BRIDGE_PORT}...`);
    try {
        const out = openLogFd();
        bridgeProcess = spawn("python3", [BRIDGE_SCRIPT, String(BRIDGE_PORT)], {
            detached: true,
            stdio: ["ignore", out, out],
            env: { ...process.env }
        });
        bridgeProcess.unref();
        lastStartTime = Date.now();
        console.log(`[Supervisor] CLI Bridge spawned with PID: ${bridgeProcess.pid}`);
    } catch (e) {
        console.error(`[Supervisor] Failed to spawn CLI Bridge:`, e);
    }
}

function openLogFd() {
    try {
        return openSync(BRIDGE_LOG, "a");
    } catch {
        return "ignore";
    }
}

export async function restartBridge() {
    isRestarting = true;
    try {
        killExistingBridge();
        await new Promise(r => setTimeout(r, 600));
        startBridge();
        // Wait up to 5 seconds for health
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 200));
            const health = await checkBridgeHealth();
            if (health.online) {
                return { success: true, latencyMs: health.latencyMs };
            }
        }
        return { success: false, error: "Health check timed out after restart" };
    } finally {
        isRestarting = false;
    }
}

export async function getBridgeLogs(lines = 50) {
    try {
        if (!existsSync(BRIDGE_LOG)) return "暂无日志文件。";
        const content = await readFile(BRIDGE_LOG, "utf-8");
        const allLines = content.split("\n");
        return allLines.slice(-lines).join("\n");
    } catch (e) {
        return `读取日志异常: ${e.message}`;
    }
}

export async function testBridgeInference() {
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(`http://127.0.0.1:${BRIDGE_PORT}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: getCurrentModel(),
                messages: [{ role: "user", content: "请回复OK。" }],
                stream: false
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content ?? "";
        return { success: true, latencyMs: Date.now() - startTime, reply };
    } catch (e) {
        return { success: false, latencyMs: Date.now() - startTime, error: e.message };
    }
}

export function initBridgeSupervisor() {
    // 首次启动检测
    checkBridgeHealth().then(health => {
        if (!health.online) {
            console.log(`[Supervisor] CLI Bridge is offline. Auto-starting...`);
            startBridge();
        } else {
            console.log(`[Supervisor] CLI Bridge is already online (${health.latencyMs}ms).`);
        }
    });

    // 守护心跳：每 5 秒检测一次，若宕机则自愈自动拉起
    if (supervisorTimer) clearInterval(supervisorTimer);
    supervisorTimer = setInterval(async () => {
        if (isRestarting) return;
        const health = await checkBridgeHealth();
        if (!health.online) {
            console.warn(`[Supervisor] Watchdog: CLI Bridge is not responding. Auto-recovering...`);
            startBridge();
        }
    }, 5000);
}
