import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_SUPER_SECRET";
const DATA_FILE = path.resolve("./data.json");

const app = express();
app.use(cors());
app.use(express.json());

function readDB() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: [], matches: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}
function writeDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = readDB();
    const user = db.users.find(u => u.id === payload.id);
    if (!user || !payload.sessionId || user.sessionId !== payload.sessionId) {
      return res.status(401).json({ error: "Unauthorized (session)" });
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

function sanitizeUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

function calcEloLikeDelta(winnerScore, loserScore) {
  // Simplified rating system: win +20, lose -10, minimum 0
  return { win: 20, lose: 10 };
}

function ensureNickname(n) {
  const s = String(n || "").trim();
  if (s.length < 2) return "Player";
  return s.slice(0, 20);
}

// --- REST API ---
app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/api/register", async (req, res) => {
  const { username, password, nickname } = req.body || {};
  const u = String(username || "").trim().toLowerCase();
  const p = String(password || "");
  if (!/^[a-z0-9_]{3,20}$/.test(u)) return res.status(400).json({ error: "username: 3-20, a-z0-9_ " });
  if (p.length < 6) return res.status(400).json({ error: "password: >=6" });

  const db = readDB();
  if (db.users.some(x => x.username === u)) return res.status(409).json({ error: "User exists" });

  const passwordHash = await bcrypt.hash(p, 10);
  const sessionId = makeSessionId();
  const user = {
    id: cryptoRandomId(),
    username: u,
    passwordHash,
    nickname: ensureNickname(nickname || u),
    avatar: "😀",
    rating: 1000,
    wins: 0,
    losses: 0,
    createdAt: Date.now(),
    sessionId
  };
  db.users.push(user);
  writeDB(db);

  const token = jwt.sign({ id: user.id, sessionId }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: sanitizeUser(user) });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const u = String(username || "").trim().toLowerCase();
  const p = String(password || "");
  const db = readDB();
  const user = db.users.find(x => x.username === u);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(p, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const sessionId = makeSessionId();
  user.sessionId = sessionId;
  writeDB(db);
  const token = jwt.sign({ id: user.id, sessionId }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, user: sanitizeUser(user) });
});

app.get("/api/me", auth, (req, res) => {
  const db = readDB();
  const user = db.users.find(x => x.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ user: sanitizeUser(user) });
});

app.post("/api/me", auth, (req, res) => {
  const { nickname, avatar } = req.body || {};
  const db = readDB();
  const user = db.users.find(x => x.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  if (nickname !== undefined) user.nickname = ensureNickname(nickname);
  if (avatar !== undefined) user.avatar = String(avatar).slice(0, 4) || "😀";
  writeDB(db);
  res.json({ user: sanitizeUser(user) });
});

app.get("/api/leaderboard", (req, res) => {
  const db = readDB();
  const top = [...db.users]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 50)
    .map(sanitizeUser);
  res.json({ top });
});

app.post("/api/matchResult", auth, (req, res) => {
  // Used for online matches or optional local result reporting
  const { opponent, result } = req.body || {}; // result: "win"|"lose"
  const db = readDB();
  const me = db.users.find(x => x.id === req.user.id);
  if (!me) return res.status(404).json({ error: "Not found" });

  const delta = calcEloLikeDelta(me.rating, 1000);
  if (result === "win") {
    me.wins += 1;
    me.rating += delta.win;
  } else if (result === "lose") {
    me.losses += 1;
    me.rating = Math.max(0, me.rating - delta.lose);
  } else {
    return res.status(400).json({ error: "result must be win/lose" });
  }

  db.matches.push({
    id: cryptoRandomId(),
    at: Date.now(),
    me: me.username,
    opponent: String(opponent || "unknown"),
    result
  });
  writeDB(db);
  res.json({ user: sanitizeUser(me) });
});

// --- WebSocket: Online matches ---
// Protocol (simplified):
// client-> server: {type:"auth", token}
// client-> server: {type:"createRoom"} -> {type:"room", code}
// client-> server: {type:"joinRoom", code}
// client-> server: {type:"move", x, y}
// server-> client: {type:"state", board, turn, players, winner?}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map(); // code -> room

// userId -> websocket (enforce single active ws per account)
const activeWsByUserId = new Map();

function makeSessionId() {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function cryptoRandomId() {
  // Node 18+ has global crypto; fallback if unavailable
  try {
    return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  } catch {
    return Math.random().toString(16).slice(2, 14);
  }
}
function roomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function emptyBoard(n = 15) {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

function checkWin(board, lastX, lastY) {
  if (lastX == null) return 0;
  const n = board.length;
  const p = board[lastY][lastX];
  if (!p) return 0;
  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];
  for (const [dx, dy] of dirs) {
    let cnt = 1;
    for (let k = 1; k < 5; k++) {
      const x = lastX + dx * k, y = lastY + dy * k;
      if (x < 0 || x >= n || y < 0 || y >= n) break;
      if (board[y][x] !== p) break;
      cnt++;
    }
    for (let k = 1; k < 5; k++) {
      const x = lastX - dx * k, y = lastY - dy * k;
      if (x < 0 || x >= n || y < 0 || y >= n) break;
      if (board[y][x] !== p) break;
      cnt++;
    }
    if (cnt >= 5) return p;
  }
  return 0;
}

function broadcast(room, msg) {
  for (const c of room.clients) {
    if (c.readyState === 1) c.send(JSON.stringify(msg));
  }
}

wss.on("connection", (ws) => {
  ws.meta = { authed: false, user: null, roomCode: null, seat: 0 };

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }
    const type = data?.type;

    if (type === "auth") {
      const token = String(data.token || "");
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        const db = readDB();
        const user = db.users.find(x => x.id === payload.id);
        if (!user || !payload.sessionId || user.sessionId !== payload.sessionId) throw new Error("no user/session");

        // kick previous websocket for this user (single active connection)
        const prev = activeWsByUserId.get(user.id);
        if (prev && prev !== ws) {
          try { prev.close(4000, "New session opened elsewhere"); } catch {}
        }
        activeWsByUserId.set(user.id, ws);

        ws.meta.authed = true;
        ws.meta.user = sanitizeUser(user);
        ws.meta.userId = user.id;
        ws.send(JSON.stringify({ type: "auth_ok", user: ws.meta.user }));
        } catch {
          ws.send(JSON.stringify({ type: "auth_fail" }));
      }
      return;
    }

    if (!ws.meta.authed) {
      ws.send(JSON.stringify({ type: "error", message: "Please auth first" }));
      return;
    }

    if (type === "createRoom") {
      const code = roomCode();
      const room = {
        code,
        board: emptyBoard(15),
        history: [],
        turn: 1,
        lastMove: null,
        winner: 0,
        players: [null, ws.meta.user],
        clients: new Set([ws]),
        undoCounts: { 1: 0, 2: 0 }, // Number of undos used per player this match
        pendingProposals: new Map() // proposalId -> {id,type,fromSeat,toSeat,ts,timeout}
      };
      rooms.set(code, room);
      ws.meta.roomCode = code;
      ws.meta.seat = 1;
      ws.send(JSON.stringify({ type: "room", code, seat: 1 }));
      broadcast(room, {
        type: "state",
        board: room.board,
        history: room.history,
        turn: room.turn,
        players: room.players,
        winner: room.winner,
        lastMove: room.lastMove,
        undoCounts: room.undoCounts
      });
      return;
    }

    if (type === "joinRoom") {
      const code = String(data.code || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
        return;
      }
      if (room.players[2]) {
        ws.send(JSON.stringify({ type: "error", message: "Room full" }));
        return;
      }
      room.players[2] = ws.meta.user;
      room.clients.add(ws);
      ws.meta.roomCode = code;
      ws.meta.seat = 2;
      ws.send(JSON.stringify({ type: "room", code, seat: 2 }));
      broadcast(room, {
        type: "state",
        board: room.board,
        history: room.history,
        turn: room.turn,
        players: room.players,
        winner: room.winner,
        lastMove: room.lastMove,
        undoCounts: room.undoCounts
      });
      return;
    }

    if (type === "move") {
      const code = ws.meta.roomCode;
      const room = rooms.get(code);
      if (!room) return;
      if (room.winner) return;

      const seat = ws.meta.seat;
      if (seat !== room.turn) return;

      const x = Number(data.x), y = Number(data.y);
      const n = room.board.length;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= n || y < 0 || y >= n) return;
      if (room.board[y][x] !== 0) return;

      room.board[y][x] = seat;
      room.history.push({ x, y, p: seat }); 
      room.lastMove = { x, y, p: seat };
      const w = checkWin(room.board, x, y);
      if (w) room.winner = w;
      room.turn = room.turn === 1 ? 2 : 1;

      broadcast(room, {
        type: "state",
        board: room.board,
        history: room.history,
        turn: room.turn,
        players: room.players,
        winner: room.winner,
        lastMove: room.lastMove,
        undoCounts: room.undoCounts
      });

      // If match ended: update ratings (only when both players are in the room)
      if (room.winner && room.players[1] && room.players[2]) {
        const db = readDB();
        const u1 = db.users.find(u => u.id === room.players[1].id);
        const u2 = db.users.find(u => u.id === room.players[2].id);
        if (u1 && u2) {
          const delta = calcEloLikeDelta(u1.rating, u2.rating);
          if (room.winner === 1) {
            u1.wins++; u2.losses++;
            u1.rating += delta.win;
            u2.rating = Math.max(0, u2.rating - delta.lose);
          } else {
            u2.wins++; u1.losses++;
            u2.rating += delta.win;
            u1.rating = Math.max(0, u1.rating - delta.lose);
          }
          db.matches.push({ id: cryptoRandomId(), at: Date.now(), me: u1.username, opponent: u2.username, result: room.winner === 1 ? "win" : "lose" });
          db.matches.push({ id: cryptoRandomId(), at: Date.now(), me: u2.username, opponent: u1.username, result: room.winner === 2 ? "win" : "lose" });
          writeDB(db);
        }
      }
      return;
    }
    // Proposal workflow (requires opponent agreement)
    // client -> server: {type:"requestProposal", action:"newGame"|"undo"}
    // client -> server: {type:"respondProposal", proposalId, accept:true|false}
    // server -> client: {type:"proposal", id, action, fromSeat}
    // server -> client: {type:"proposal_result", id, action, accept, reason?}
    // server -> client: {type:"proposal_sent", id, action}

    if (type === "requestProposal") {
      const code = ws.meta.roomCode;
      const room = rooms.get(code);
      if (!room) return;
      if (!ws.meta.seat) return;

      const action = String(data.action || "");
      if (action !== "newGame" && action !== "undo") {
        ws.send(JSON.stringify({ type: "error", message: "Invalid proposal action" }));
        return;
      }

      const fromSeat = ws.meta.seat;
      const toSeat = fromSeat === 1 ? 2 : 1;
      if (!room.players[toSeat]) {
        ws.send(JSON.stringify({ type: "error", message: "Opponent is not in the room yet" }));
        return;
      }

      const MAX_UNDO = 3;
      if (action === "undo") {
        if (room.winner) {
          ws.send(JSON.stringify({ type: "error", message: "Match already decided, undo is not allowed" }));
          return;
        }
        if (room.history.length === 0) {
          ws.send(JSON.stringify({ type: "error", message: "No move available to undo" }));
          return;
        }
        if ((room.undoCounts[fromSeat] || 0) >= MAX_UNDO) {
          ws.send(JSON.stringify({ type: "error", message: "Undo limit reached" }));
          return;
        }
      }

      const proposalId = cryptoRandomId();
      const proposal = { id: proposalId, type: action, fromSeat, toSeat, ts: Date.now(), timeout: null };
      room.pendingProposals.set(proposalId, proposal);

      // auto-timeout (20s)
      proposal.timeout = setTimeout(() => {
        if (!room.pendingProposals.has(proposalId)) return;
        room.pendingProposals.delete(proposalId);
        broadcast(room, { type: "proposal_result", id: proposalId, action, accept: false, reason: "timeout" });
      }, 20000);

      // send proposal to opponent
      for (const c of room.clients) {
        if (c.readyState === 1 && c.meta && c.meta.seat === toSeat) {
          c.send(JSON.stringify({ type: "proposal", id: proposalId, action, fromSeat }));
        }
      }

      ws.send(JSON.stringify({ type: "proposal_sent", id: proposalId, action }));
      return;
    }

    if (type === "respondProposal") {
      const code = ws.meta.roomCode;
      const room = rooms.get(code);
      if (!room) return;

      const proposalId = String(data.proposalId || "");
      const accept = !!data.accept;
      const prop = room.pendingProposals.get(proposalId);
      if (!prop) {
        ws.send(JSON.stringify({ type: "error", message: "proposal not found" }));
        return;
      }
      if (ws.meta.seat !== prop.toSeat) {
        ws.send(JSON.stringify({ type: "error", message: "no permission" }));
        return;
      }

      try { clearTimeout(prop.timeout); } catch {}
      room.pendingProposals.delete(proposalId);

      broadcast(room, { type: "proposal_result", id: proposalId, action: prop.type, accept });

      if (!accept) return;

      if (prop.type === "newGame") {
        room.board = emptyBoard(15);
        room.history = [];
        room.turn = 1;
        room.lastMove = null;
        room.winner = 0;
        room.undoCounts = { 1: 0, 2: 0 };
        broadcast(room, {
          type: "state",
          board: room.board,
          history: room.history,
          turn: room.turn,
          players: room.players,
          winner: room.winner,
          lastMove: room.lastMove,
          undoCounts: room.undoCounts
        });
        return;
      }

      if (prop.type === "undo") {
        const MAX_UNDO = 3;
        if (room.winner) return;
        if (room.history.length === 0) return;
        if ((room.undoCounts[prop.fromSeat] || 0) >= MAX_UNDO) return;

        const last = room.history.pop();
        room.board[last.y][last.x] = 0;
        room.turn = last.p;
        room.lastMove = room.history.length ? room.history[room.history.length - 1] : null;
        room.undoCounts[prop.fromSeat] = (room.undoCounts[prop.fromSeat] || 0) + 1;

        broadcast(room, {
          type: "state",
          board: room.board,
          history: room.history,
          turn: room.turn,
          players: room.players,
          winner: room.winner,
          lastMove: room.lastMove,
          undoCounts: room.undoCounts
        });
        return;
      }
    }
  });

  ws.on("close", () => {
    if (ws.meta && ws.meta.userId) {
      const cur = activeWsByUserId.get(ws.meta.userId);
      if (cur === ws) activeWsByUserId.delete(ws.meta.userId);
    }
    const code = ws.meta.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.clients.delete(ws);
    // Simple cleanup: delete the room if empty
    if (room.clients.size === 0) rooms.delete(code);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
