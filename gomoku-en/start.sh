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
echo " Gomoku Auto Start Script"
echo "===================================="

# ---------- Check Node ----------
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed. Please install Node 18+ first."
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# ---------- Install Backend Dependencies ----------
echo "Checking backend dependencies..."

cd "$SERVER_DIR"

if [ ! -d "node_modules" ]; then
    echo "🔧 Installing server dependencies..."
    npm install
else
    echo "✔ node_modules already exists"
fi

# ---------- Start Backend ----------
echo "Starting backend (port $SERVER_PORT)..."
node server.js &
SERVER_PID=$!

# Wait for server startup
sleep 2

# ---------- Check server health ----------
if curl -s "http://localhost:$SERVER_PORT/health" > /dev/null; then
    echo "✅ Backend started successfully"
else
    echo "❌ Backend failed to start"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# ---------- Start Frontend ----------
cd "$PROJECT_ROOT"

echo "Starting frontend (port $WEB_PORT)..."

# Auto-install serve if missing
if ! command -v serve &> /dev/null
then
    echo "🔧 Installing serve..."
    npm install -g serve
fi

serve -s web -l $WEB_PORT &
WEB_PID=$!

sleep 2

echo ""
echo "===================================="
echo "🎮 Gomoku is running!"
echo ""
echo "Frontend: http://localhost:$WEB_PORT"
echo "Backend: http://localhost:$SERVER_PORT"
echo "===================================="
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# ---------- Ctrl+C Cleanup ----------
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $SERVER_PID 2>/dev/null
    kill $WEB_PID 2>/dev/null
    echo "✅ All services stopped"
    exit 0
}

trap cleanup SIGINT

# Wait
wait
