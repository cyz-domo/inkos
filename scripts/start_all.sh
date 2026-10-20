#!/bin/bash
# 一键启动 InkOS 写作工作台所有配套服务

echo "=== 正在启动 InkOS 本地 CLI Bridge (端口 9099) ==="
pkill -f "cli_bridge.py" 2>/dev/null || true
nohup python3 /data/novels/bridge/cli_bridge.py 9099 > /data/novels/bridge/bridge.log 2>&1 &
echo "CLI Bridge 已启动 (PID: $!)"

echo "=== 正在启动 InkOS 官方 Studio (端口 4567 / 访问 4568) ==="
pkill -f "inkos-studio/dist/api/index.js" 2>/dev/null || true
INKOS_STUDIO_PORT=4567 nohup node /usr/lib/node_modules/@actalk/inkos/node_modules/@actalk/inkos-studio/dist/api/index.js /data/novels/test/my-novel > /data/novels/studio.log 2>&1 &
echo "InkOS Studio 已启动 (PID: $!)"

echo "=== 正在启动小说切片导出与备用面板 (端口 8080) ==="
pkill -f "dashboard/server.py" 2>/dev/null || true
nohup python3 /data/novels/dashboard/server.py 8080 > /data/novels/dashboard/dashboard.log 2>&1 &
echo "Novel Dashboard 已启动 (PID: $!)"

echo "=== 全部服务已就绪 ==="
echo "官方 Studio 地址: http://10.11.1.14:4568/"
echo "切片导出面板地址: http://10.11.1.14:8080/"
