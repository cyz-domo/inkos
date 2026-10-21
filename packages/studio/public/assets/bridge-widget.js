// InkOS Local CLI Bridge Management Widget
// 注入式悬浮状态胶囊与管理控制台

(function() {
    if (window.__inkosBridgeWidgetInjected) return;
    window.__inkosBridgeWidgetInjected = true;

    const STYLES = `
    .inkos-bridge-pill {
        position: fixed;
        bottom: 20px;
        right: 24px;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        background: rgba(18, 22, 34, 0.88);
        color: #e2e8f0;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 9999px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.36);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        user-select: none;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .inkos-bridge-pill:hover {
        transform: translateY(-2px);
        background: rgba(26, 32, 50, 0.95);
        border-color: rgba(99, 102, 241, 0.5);
        box-shadow: 0 12px 36px rgba(99, 102, 241, 0.25);
    }
    .inkos-bridge-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 10px #10b981;
        transition: background 0.3s;
    }
    .inkos-bridge-dot.offline {
        background: #ef4444;
        box-shadow: 0 0 10px #ef4444;
        animation: pulse 1.5s infinite;
    }
    .inkos-bridge-dot.loading {
        background: #f59e0b;
        box-shadow: 0 0 10px #f59e0b;
        animation: pulse 1s infinite;
    }
    @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.2); }
    }
    .inkos-bridge-modal {
        position: fixed;
        bottom: 64px;
        right: 24px;
        width: 380px;
        background: #0f172a;
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        display: none;
        flex-direction: column;
        overflow: hidden;
        animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideUp {
        from { opacity: 0; transform: translateY(12px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .inkos-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: rgba(30, 41, 59, 0.7);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .inkos-modal-title {
        font-weight: 600;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .inkos-modal-close {
        cursor: pointer;
        color: #94a3b8;
        font-size: 16px;
        padding: 2px 6px;
        border-radius: 6px;
        transition: all 0.2s;
    }
    .inkos-modal-close:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }
    .inkos-modal-body {
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-height: 480px;
        overflow-y: auto;
    }
    .inkos-info-card {
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .inkos-info-row {
        display: flex;
        justify-content: space-between;
        color: #94a3b8;
        font-size: 12px;
    }
    .inkos-info-row span:last-child {
        color: #e2e8f0;
        font-weight: 500;
    }
    .inkos-form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .inkos-label {
        font-size: 12px;
        color: #94a3b8;
        font-weight: 500;
    }
    .inkos-select {
        background: #1e293b;
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        outline: none;
        cursor: pointer;
    }
    .inkos-select:focus {
        border-color: #6366f1;
    }
    .inkos-btn-group {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }
    .inkos-btn {
        padding: 8px 12px;
        border-radius: 8px;
        border: none;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.2s;
    }
    .inkos-btn-primary {
        background: #4f46e5;
        color: #fff;
    }
    .inkos-btn-primary:hover {
        background: #4338ca;
    }
    .inkos-btn-secondary {
        background: #334155;
        color: #e2e8f0;
    }
    .inkos-btn-secondary:hover {
        background: #475569;
    }
    .inkos-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .inkos-log-box {
        background: #020617;
        color: #a5f3fc;
        font-family: Consolas, monospace;
        font-size: 11px;
        line-height: 1.4;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        height: 120px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-all;
        display: none;
    }
    `;

    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    // Create Pill Element
    const pill = document.createElement("div");
    pill.className = "inkos-bridge-pill";
    pill.innerHTML = `
        <div class="inkos-bridge-dot" id="inkosBridgeDot"></div>
        <span id="inkosBridgeStatusText">Bridge 检测中...</span>
    `;
    document.body.appendChild(pill);

    // Create Modal Element
    const modal = document.createElement("div");
    modal.className = "inkos-bridge-modal";
    modal.innerHTML = `
        <div class="inkos-modal-header">
            <div class="inkos-modal-title">
                <span>⚡</span>
                <span>CLI Bridge 管理控制台</span>
            </div>
            <div class="inkos-modal-close" id="inkosModalClose">&times;</div>
        </div>
        <div class="inkos-modal-body">
            <div class="inkos-info-card">
                <div class="inkos-info-row">
                    <span>运行状态</span>
                    <span id="inkosInfoState" style="color: #10b981;">● 正常运行</span>
                </div>
                <div class="inkos-info-row">
                    <span>监听端口</span>
                    <span>127.0.0.1:9099</span>
                </div>
                <div class="inkos-info-row">
                    <span>守护机制</span>
                    <span style="color: #a78bfa;">Studio 自动自愈守护</span>
                </div>
                <div class="inkos-info-row">
                    <span>推理延迟</span>
                    <span id="inkosInfoLatency">-- ms</span>
                </div>
            </div>

            <div class="inkos-form-group">
                <label class="inkos-label">当前活跃模型 (持久化写入 .env)</label>
                <select class="inkos-select" id="inkosModelSelect">
                    <option value="gemini-3.8-flash-medium">Gemini 3.8 Flash (Medium) - 极速推荐 (5~6s)</option>
                    <option value="gemini-3.8-flash-high">Gemini 3.8 Flash (High) - 深度思考 (60~90s)</option>
                    <option value="gemini-3.8-flash-low">Gemini 3.8 Flash (Low) - 极速轻量 (3~4s)</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Thinking)</option>
                    <option value="claude-opus-4-6-thinking">Claude Opus 4.6 (Thinking)</option>
                    <option value="opencode-default">OpenCode Default (本地底座)</option>
                </select>
            </div>

            <div class="inkos-btn-group">
                <button class="inkos-btn inkos-btn-primary" id="inkosBtnRestart">🔄 一键重启</button>
                <button class="inkos-btn inkos-btn-secondary" id="inkosBtnTest">⚡ 连通测速</button>
            </div>

            <div>
                <button class="inkos-btn inkos-btn-secondary" style="width: 100%; margin-bottom: 6px;" id="inkosBtnToggleLogs">📋 查看运行日志</button>
                <div class="inkos-log-box" id="inkosLogBox">正在加载日志...</div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // State Variables
    let isModalOpen = false;
    let availableModels = [];

    // Toggle Modal
    pill.addEventListener("click", () => {
        isModalOpen = !isModalOpen;
        modal.style.display = isModalOpen ? "flex" : "none";
        if (isModalOpen) refreshStatus();
    });

    document.getElementById("inkosModalClose").addEventListener("click", () => {
        isModalOpen = false;
        modal.style.display = "none";
    });

    // Refresh Status Function
    async function refreshStatus() {
        const dot = document.getElementById("inkosBridgeDot");
        const statusText = document.getElementById("inkosBridgeStatusText");
        const infoState = document.getElementById("inkosInfoState");
        const infoLatency = document.getElementById("inkosInfoLatency");
        const modelSelect = document.getElementById("inkosModelSelect");

        try {
            const res = await fetch("/api/v1/bridge/status");
            if (!res.ok) throw new Error("HTTP error");
            const data = await res.json();

            if (data.ok) {
                dot.className = "inkos-bridge-dot";
                statusText.textContent = `Bridge: ${cleanModelName(data.model)}`;
                infoState.innerHTML = `<span style="color: #10b981;">● 正常连通</span>`;
                infoLatency.textContent = `${data.latencyMs} ms`;
            } else {
                dot.className = "inkos-bridge-dot offline";
                statusText.textContent = `Bridge: 离线 (自愈中...)`;
                infoState.innerHTML = `<span style="color: #ef4444;">● 离线 (自愈守护中)</span>`;
                infoLatency.textContent = `-- ms`;
            }

            if (data.model && modelSelect.value !== data.model) {
                modelSelect.value = data.model;
            }
        } catch (e) {
            dot.className = "inkos-bridge-dot offline";
            statusText.textContent = `Bridge: 通信异常`;
            infoState.innerHTML = `<span style="color: #ef4444;">● 连接失败</span>`;
        }
    }

    function cleanModelName(m) {
        if (!m) return "在线";
        if (m.includes("medium")) return "Flash Medium";
        if (m.includes("high")) return "Flash High";
        if (m.includes("low")) return "Flash Low";
        if (m.includes("sonnet")) return "Claude Sonnet";
        if (m.includes("opus")) return "Claude Opus";
        return m.split("-")[0];
    }

    // Switch Model
    document.getElementById("inkosModelSelect").addEventListener("change", async (e) => {
        const newModel = e.target.value;
        const btn = document.getElementById("inkosBtnRestart");
        const infoState = document.getElementById("inkosInfoState");
        infoState.innerHTML = `<span style="color: #f59e0b;">● 正在保存并切换模型...</span>`;
        try {
            const res = await fetch("/api/v1/bridge/model", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: newModel })
            });
            const data = await res.json();
            if (data.ok) {
                await refreshStatus();
            } else {
                alert(`模型切换失败: ${data.error || "未知异常"}`);
            }
        } catch (err) {
            alert(`请求失败: ${err.message}`);
        }
    });

    // Restart Button
    document.getElementById("inkosBtnRestart").addEventListener("click", async () => {
        const btn = document.getElementById("inkosBtnRestart");
        btn.disabled = true;
        btn.textContent = "⏳ 正在重启...";
        try {
            const res = await fetch("/api/v1/bridge/restart", { method: "POST" });
            const data = await res.json();
            if (data.success) {
                await refreshStatus();
            } else {
                alert(`重启失败: ${data.error || "未知异常"}`);
            }
        } catch (err) {
            alert(`重启请求异常: ${err.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = "🔄 一键重启";
        }
    });

    // Test Button
    document.getElementById("inkosBtnTest").addEventListener("click", async () => {
        const btn = document.getElementById("inkosBtnTest");
        const infoLatency = document.getElementById("inkosInfoLatency");
        btn.disabled = true;
        btn.textContent = "⚡ 测速中...";
        infoLatency.textContent = "测速中...";
        try {
            const res = await fetch("/api/v1/bridge/test", { method: "POST" });
            const data = await res.json();
            if (data.success) {
                infoLatency.innerHTML = `<span style="color: #10b981;">${data.latencyMs} ms (正常)</span>`;
            } else {
                infoLatency.innerHTML = `<span style="color: #ef4444;">失败: ${data.error}</span>`;
            }
        } catch (err) {
            infoLatency.innerHTML = `<span style="color: #ef4444;">测速失败</span>`;
        } finally {
            btn.disabled = false;
            btn.textContent = "⚡ 连通测速";
        }
    });

    // Log Box Toggle
    let isLogOpen = false;
    document.getElementById("inkosBtnToggleLogs").addEventListener("click", async () => {
        const logBox = document.getElementById("inkosLogBox");
        isLogOpen = !isLogOpen;
        logBox.style.display = isLogOpen ? "block" : "none";
        if (isLogOpen) {
            logBox.textContent = "正在拉取日志...";
            try {
                const res = await fetch("/api/v1/bridge/logs");
                const data = await res.json();
                logBox.textContent = data.logs || "暂无日志。";
                logBox.scrollTop = logBox.scrollHeight;
            } catch (err) {
                logBox.textContent = `读取日志失败: ${err.message}`;
            }
        }
    });

    // Initial and periodic check
    refreshStatus();
    setInterval(refreshStatus, 8000);
})();
