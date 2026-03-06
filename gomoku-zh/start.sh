#!/bin/bash

# ==============================
# Gomoku Auto Start Script
# ==============================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$PROJECT_ROOT/server"
WEB_DIR="$PROJECT_ROOT/web"

SERVER_PORT=8787
WEB_PORT=5173

echo "===================================="
echo " Gomoku 自動啟動腳本"
echo "===================================="

# ---------- 檢查 Node ----------
if ! command -v node &> /dev/null
then
    echo "❌ 未安裝 Node.js，請先安裝 Node 18+"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# ---------- 安裝後端依賴 ----------
echo "檢查後端依賴..."

cd "$SERVER_DIR"

if [ ! -d "node_modules" ]; then
    echo "🔧 安裝 server 依賴..."
    npm install
else
    echo "✔ 已存在 node_modules"
fi

# ---------- 啟動後端 ----------
echo "啟動後端 (port $SERVER_PORT)..."
node server.js &
SERVER_PID=$!

# 等待 server 啟動
sleep 2

# ---------- 檢查 server 是否啟動 ----------
if curl -s "http://localhost:$SERVER_PORT/health" > /dev/null; then
    echo "✅ 後端啟動成功"
else
    echo "❌ 後端啟動失敗"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# ---------- 啟動前端 ----------
cd "$PROJECT_ROOT"

echo "啟動前端 (port $WEB_PORT)..."

# 若沒安裝 serve，自動安裝
if ! command -v serve &> /dev/null
then
    echo "🔧 安裝 serve..."
    npm install -g serve
fi

serve -s web -l $WEB_PORT &
WEB_PID=$!

sleep 2

echo ""
echo "===================================="
echo "🎮 Gomoku 已啟動！"
echo ""
echo "前端: http://localhost:$WEB_PORT"
echo "後端: http://localhost:$SERVER_PORT"
echo "===================================="
echo ""
echo "按 Ctrl+C 可關閉所有服務"
echo ""

# ---------- Ctrl+C 清理 ----------
cleanup() {
    echo ""
    echo "🛑 正在關閉服務..."
    kill $SERVER_PID 2>/dev/null
    kill $WEB_PID 2>/dev/null
    echo "✅ 已全部關閉"
    exit 0
}

trap cleanup SIGINT

# 等待
wait