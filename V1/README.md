# Comic Pilot — How to Run

Comic Pilot uses a **Python FastAPI backend** and a **React (Vite) frontend**. You need both running.

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+** and **npm**
- A **LlamaGen** account at [llamagen.ai](https://llamagen.ai) (for comic generation)

---

## 1. Get your LlamaGen session token

1. Log in at [https://llamagen.ai](https://llamagen.ai).
2. Open DevTools (F12) → **Application** → **Cookies** → `https://llamagen.ai`.
3. Copy the value of **`__Secure-next-auth.session-token`**.

---

## 2. Store your token in a `.env` file (one-time)

In the `040 Pilot/V1` folder, create a `.env` file with your token so you don’t have to export it every time:

```bash
cd "040 Pilot/V1"
cp .env.example .env
```

Then edit `.env` and replace `your-session-token-here` with the cookie value you copied. The backend will load it automatically.

---

## 3. Install dependencies

**Backend (once):**
```bash
cd "040 Pilot/V1"
python3 -m pip install -r requirements.txt
```

**Frontend (once):**
```bash
cd "040 Pilot/V1/frontend"
npm install
```

---

## 4. Run the project

Use **two terminals**.

**Terminal 1 — Backend (port 8000):**
```bash
cd "040 Pilot/V1"
./run-backend.sh
```
Or: `bash run-backend.sh`  
Or manually: `python3 -m uvicorn comic_pilot_backend:app --reload --port 8000`  
(The backend reads `LLAMAGEN_SESSION_TOKEN` from `.env`.)

**Terminal 2 — Frontend (port 3000):**
```bash
cd "040 Pilot/V1/frontend"
./run-frontend.sh
```
Or manually:
```bash
cd "040 Pilot/V1/frontend"
npm run dev
```

---

## 5. Open the app

- Frontend: **http://localhost:3000**
- Backend health: **http://localhost:8000/api/health**

The UI shows **"Backend OK"** when the backend is running and the token is set. Then add characters, scenes, and click **Generate** to create a comic.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Backend not reachable` | Start the backend first (Terminal 1). |
| `LLAMAGEN_SESSION_TOKEN not set` | Add it to `.env` (copy from `.env.example` and paste your token). |
| Token expired | Log in again at llamagen.ai and copy the new cookie value. |
| Port in use | Change frontend port: `npm run dev -- --port 5173` and add `CORS_ORIGINS=http://localhost:5173` to `.env`. |

---

## Project layout

```
040 Pilot/V1/
├── comic_pilot_backend.py   # FastAPI backend
├── .env                     # Your LLAMAGEN_SESSION_TOKEN (create from .env.example)
├── .env.example             # Template for .env
├── requirements.txt
├── run-backend.sh           # Start backend
├── run-frontend.sh          # Start frontend
├── frontend/                # React + Vite + Tailwind
│   ├── package.json
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   └── components/ComicPilot.jsx
│   └── ...
└── README.md
```
