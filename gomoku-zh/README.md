

# 🎮 Gomoku 五子棋 (Full Stack Online Game)

一個完整的五子棋對戰系統，包含：

- ✅ 單人 AI（3 種難度，Minimax + Alpha-Beta）
- ✅ 同機雙人模式
- ✅ 聯網對戰（WebSocket 即時同步）
- ✅ 帳號系統（JWT + 單一登入限制）
- ✅ 排行榜
- ✅ 個人資料頁
- ✅ 聯網新局需對方同意
- ✅ 聯網悔棋需對方同意 + 每局次數限制
- ✅ 簡約現代 UI 設計

---

# 📦 專案結構

```
gomoku/
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

# ⚙️ 系統需求

- Node.js 18+
- npm
- macOS / Linux / WSL（Windows 可用 Git Bash）

---

# 🚀 快速啟動（推薦方式）

## 1️⃣ 給腳本執行權限

```bash
chmod +x start.sh
```

## 2️⃣ 一鍵啟動

```bash
./start.sh
```

啟動成功後：

```
前端: http://localhost:5173
後端: http://localhost:8787
```

---

# 🔧 手動啟動方式

## 啟動後端

```bash
cd server
npm install
npm start
```

## 啟動前端

```bash
npx serve web -l 5173
```

然後打開：

```
http://localhost:5173
```

---

# 🧠 AI 設計說明

AI 使用：

- 候選點剪枝
- 模式評分（活三 / 活四 / 衝四）
- Minimax
- Alpha-Beta 剪枝
- 迭代加深（Hard 模式）

難度說明：

| 難度 | 說明 |
|------|------|
| Easy | 單層評估 |
| Normal | 深度 3 Minimax |
| Hard | 迭代加深 + 節點限制 |

---

# 🌐 聯網系統設計

使用：

- Express REST API
- WebSocket (`ws`)
- 房間制對戰

### 聯網規則

- 新局必須對方同意
- 悔棋必須對方同意
- 每人每局最多 3 次悔棋
- 勝負後禁止悔棋
- 20 秒未回應自動拒絕

---

# 🔐 登入系統

使用：

- JWT
- bcrypt
- sessionId 機制

### 單一登入限制

每次登入會產生新的 `sessionId`

舊 token 立即失效  
舊 WebSocket 連線會被踢出

---

# 🏆 排行榜機制

積分規則：

- 勝利 +20
- 失敗 -10
- 最低 0 分

依 rating 排序

---

# 📊 個人資料頁

可修改：

- 暱稱
- 頭像（emoji）

顯示：

- 積分
- 勝負
- 勝率

---

# 🛡 安全設計

- 所有 move 驗證在 server 端
- 伺服器為唯一棋盤真實來源
- JWT 驗證 + sessionId 驗證
- 聯網操作皆經 server 控制

---

# 🐳 Docker（可選）

如需 Docker 部署，可自行建立：

- Dockerfile（server）
- Nginx 靜態服務
- docker-compose.yml

如需要我可以提供完整版本。

---

# 🧪 開發模式

可修改：

```
server/server.js
web/index.html
```

重啟 server 即可生效。

---

# 📌 常見問題

### Q: 聯網沒反應？

- 確認已登入
- 確認 server 正在運行
- 確認 WebSocket 連線成功

---

### Q: 舊帳號無法登入？

請刪除 `server/data.json` 重新註冊

---

### Q: 端口衝突？

修改：

```bash
SERVER_PORT
WEB_PORT
```

於 `start.sh`

---

# 📈 未來可擴充

- 配對系統（自動匹配）
- 對局回放
- 威脅搜尋 AI（VCT / VCF）
- 開局庫
- AI vs AI
- 觀戰模式
- 聊天系統
- HTTPS + Nginx
- Redis session
- PostgreSQL 資料庫
- ELO 計算

---

# 📄 License

MIT

---

# 🙌 作者

Full Stack Gomoku Project  
Built with ❤️ and Node.js