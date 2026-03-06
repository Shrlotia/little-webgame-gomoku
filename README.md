# Gomoku (Full Stack Online Game)

A complete Gomoku battle system, including:

- ✅ Single-player AI (3 difficulty levels, Minimax + Alpha-Beta)
- ✅ Local two-player mode
- ✅ Online multiplayer (real-time sync via WebSocket)
- ✅ Account system (JWT + single-login restriction)
- ✅ Leaderboard
- ✅ Profile page
- ✅ Online new game requires opponent approval
- ✅ Online undo requires opponent approval + per-match limit
- ✅ Clean modern UI design

---

# Project Structure

```
gomoku-*/
│
├── server/
│   ├── server.js
│   ├── package.json
│   └── data.json
│
├── web/
│   └── index.html
│
├── start.sh
└── README.md
```

---

# System Requirements

- Node.js 18+
- npm
- macOS / Linux / WSL (Windows can use Git Bash)

---

# Quick Start (Recommended)

## 1 Make the script executable

```bash
chmod +x start.sh
```

## 2 Start with one command

```bash
./start.sh
```

After startup:

```
Frontend: http://localhost:5173
Backend: http://localhost:8787
```

---

# Manual Start

## Start backend

```bash
cd server
npm install
npm start
```

## Start frontend

```bash
npx serve web -l 5173
```

Then open:

```
http://localhost:5173
```

---

# AI Design

AI uses:

- Candidate move pruning
- Pattern scoring (open three / open four / broken four)
- Minimax
- Alpha-Beta pruning
- Iterative deepening (Hard mode)

Difficulty levels:

| Difficulty | Description |
|------|------|
| Easy | Single-ply evaluation |
| Normal | Depth-3 Minimax |
| Hard | Iterative deepening + node limit |

---

# Online System Design

Uses:

- Express REST API
- WebSocket (`ws`)
- Room-based matches

### Online Rules

- New game must be approved by opponent
- Undo must be approved by opponent
- Max 3 undos per player per match
- Undo disabled after match result
- Auto-reject after 20 seconds without response

---

# Authentication System

Uses:

- JWT
- bcrypt
- sessionId mechanism

### Single Login Restriction

Each login generates a new `sessionId`.

Old tokens become invalid immediately.  
Old WebSocket sessions are disconnected.

---

# Leaderboard Rules

Scoring rules:

- Win +20
- Loss -10
- Minimum score is 0

Sorted by rating.

---

# Profile Page

Editable:

- Nickname
- Avatar (emoji)

Displayed:

- Rating
- Wins / losses
- Win rate

---

# Security Design

- All moves are validated on the server
- Server is the single source of truth for board state
- JWT validation + sessionId validation
- Online actions are controlled by the server

---

# Docker (Optional)

For Docker deployment, you can create:

- Dockerfile (server)
- Nginx static hosting
- docker-compose.yml

If needed, I can provide a full Docker version.

---

# Development Mode

You can modify:

```
server/server.js
web/index.html
```

Restart the server to apply changes.

---

# FAQ

### Q: Online mode is not responding?

- Make sure you are logged in
- Make sure the server is running
- Make sure WebSocket is connected

---

### Q: Existing account cannot log in?

Delete `server/data.json` and register again.

---

### Q: Port conflict?

Change:

```bash
SERVER_PORT
WEB_PORT
```

in `start.sh`.

---

# Future Extensions

- Matchmaking system (auto match)
- Match replay
- Threat-search AI (VCT / VCF)
- Opening book
- AI vs AI
- Spectator mode
- Chat system
- HTTPS + Nginx
- Redis session
- PostgreSQL database
- ELO calculation

---

# License

MIT

---
