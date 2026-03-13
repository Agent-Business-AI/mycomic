# Comic Pilot V2 — LlamaGen Public API / SDK

Replica of the 040 Pilot using the **LlamaGen Comic Public API** via the official `comic` SDK instead of the internal API.

## Use Cases Supported

1. **Default with single prompt** — Simple text prompt, default options
2. **Text prompt with custom options** — Preset, size, panel count (1–20)
3. **Character consistency** — Above + `comicRoles` with name, age, gender, dress, image (URL or file upload)
4. **Per-panel prompts** — Structured prompt template with [Visual Style], [Story], [Characters], [Panels], [Constraints]

## Prerequisites

- **Node.js 18+**
- **LlamaGen API key** from [llamagen.ai/settings?tab=api](https://llamagen.ai/settings?tab=api)

## Setup

1. **Create `.env`** (copy from `.env.example`):

   ```bash
   cd "040 Pilot/V2"
   cp .env.example .env
   ```

2. **Add your API key** to `.env`:

   ```
   LLAMAGEN_API_KEY=sk-your-key-here
   ```

3. **Install dependencies**:

   ```bash
   npm install
   cd frontend && npm install
   ```

## Run

**Terminal 1 — Backend (port 8000):**

```bash
cd "040 Pilot/V2"
./run-backend.sh
```

Or: `node server.js`

**Terminal 2 — Frontend (port 5555):**

```bash
cd "040 Pilot/V2/frontend"
npm run dev
```

- Frontend: **http://localhost:5555**
- Backend health: **http://localhost:8000/api/health**

## Prompt Template (from LlamaGen docs)

For stable, high-quality output:

```
[Visual Style]
- Genre:
- Art style:
- Color palette:
- Lighting:
- Camera language:

[Story]
- Premise:
- Conflict:
- Emotional tone:
- Ending beat:

[Characters]
- Name:
  - Role:
  - Appearance:
  - Personality:
  - Signature expression/action:

[Panels]
1) Panel objective:
   - Scene description:
   - Character action:
   - Dialogue / caption:
2) Panel objective:
   ...

[Constraints]
- Aspect ratio / size:
- Forbidden elements:
- Consistency requirements:
```

## Supported Sizes

1024x1024 (1:1), 512x768 (2:3), 512x1024 (1:2), 576x1024 (9:16), 768x1024 (3:4), 1024x768 (4:3), 768x512 (3:2), 1024x576 (16:9), 1024x512 (2:1)

## Project Layout

```
040 Pilot/V2/
├── server.js              # Node.js backend (comic SDK)
├── package.json
├── .env                   # LLAMAGEN_API_KEY
├── frontend/
│   ├── src/
│   │   ├── components/ComicPilot.jsx
│   │   └── ...
│   └── package.json
├── run-backend.sh
├── run-frontend.sh
└── README.md
```
