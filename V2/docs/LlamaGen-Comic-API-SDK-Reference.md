# LlamaGen Comic Public API & SDK — Complete Reference

**Document Version:** 1.0  
**Last Updated:** March 2025  
**Source:** [llamagen.ai/comic-api/docs](https://llamagen.ai/comic-api/docs)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [What You Can Achieve](#3-what-you-can-achieve)
4. [API Endpoints](#4-api-endpoints)
5. [Parameters & Options](#5-parameters--options)
6. [Limitations](#6-limitations)
7. [Rate Limits & Pricing](#7-rate-limits--pricing)
8. [SDK Capabilities](#8-sdk-capabilities)
9. [Prompt Best Practices](#9-prompt-best-practices)
10. [Error Handling](#10-error-handling)

---

## 1. Overview

The LlamaGen Comic API lets you integrate AI-powered comic generation into your applications. You send a prompt (and optional parameters), and the API returns generated comic panels.

**Base URL:** `https://api.llamagen.ai/v1`

**Key characteristics:**
- REST API with JSON payloads
- Official JavaScript/TypeScript SDK (`comic` npm package)
- MCP (Model Context Protocol) support for AI agents
- Bearer token authentication

---

## 2. Authentication

| Method | Details |
|--------|---------|
| **Type** | HTTP Bearer Auth |
| **Header** | `Authorization: Bearer YOUR_API_TOKEN` |
| **Where to get** | [llamagen.ai/settings?tab=api](https://llamagen.ai/settings?tab=api) |
| **Note** | No username required; API key only |

---

## 3. What You Can Achieve

### 3.1 Comic Generation

| Capability | Description | API Support |
|------------|-------------|-------------|
| **Text-to-comic** | Generate comics from text prompts | ✅ Full |
| **Image-to-comic** | Use uploaded reference image as prompt input | ✅ Via `promptUrl` |
| **Panel count control** | Set 1–20 panels per page | ✅ `fixPanelNum` |
| **Output size** | 9 aspect ratios supported | ✅ `size` |
| **Style preset** | Control visual style | ✅ `preset` |
| **Model selection** | Override default model | ✅ `model` (plan-dependent) |

### 3.2 Character Consistency

| Capability | Description | API Support |
|------------|-------------|-------------|
| **Character definition** | Define characters for consistent faces | ✅ `comicRoles` |
| **Reference image per character** | Use image URL for face consistency | ✅ `comicRoles[].image` |
| **Character attributes** | Name, age, gender, dress | ✅ `comicRoles` |
| **File upload for characters** | Upload image via `/comics/upload` | ✅ Supported |

### 3.3 Reference Image Upload

| Capability | Description | API Support |
|------------|-------------|-------------|
| **Upload image** | Upload file for use as `promptUrl` or character image | ✅ `POST /comics/upload` |
| **Max file size** | 10 MB | ✅ |
| **Response** | Returns `fileUrl` for use in generations | ✅ |

### 3.4 Status & Usage

| Capability | Description | API Support |
|------------|-------------|-------------|
| **Check generation status** | Poll until complete | ✅ `GET /comics/generations/:id` |
| **Get API usage** | Credits, quota, remaining | ✅ `GET /comics/usage` |

---

## 4. API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/comics/generations` | Create a comic generation job |
| GET | `/comics/generations/:id` | Get generation status and result |
| POST | `/comics/upload` | Upload reference image |
| GET | `/comics/usage` | Get usage and quota |

---

## 5. Parameters & Options

### 5.1 Create Comic (`POST /comics/generations`)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes* | Story description or script |
| `promptUrl` | string (URL) | Yes* | Alternative to prompt; use uploaded image URL |
| `model` | string | No | Model override (plan-dependent) |
| `preset` | string | No | Style preset (default: `"render"`) |
| `size` | string | No | Output resolution (see table below) |
| `fixPanelNum` | number | No | Panels per page (1–20, default: 4) |
| `comicRoles` | array | No | Character list for face consistency |

*At least one of `prompt` or `promptUrl` is required.

### 5.2 Comic Role Object

```json
{
  "name": "Alice",
  "age": 23,
  "gender": "female",
  "dress": "hoodie",
  "image": "https://example.com/alice.png"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Character name |
| `age` | number | Yes | Character age |
| `gender` | string | Yes | `"male"` or `"female"` |
| `dress` | string | No | Clothing description |
| `image` | string (URL) | No | Reference image for face consistency |

### 5.3 Supported Sizes

| Ratio | Size | Width × Height | Best For |
|-------|------|----------------|----------|
| 1:1 | 1024x1024 | 1024 × 1024 | Square, covers, profile art |
| 2:3 | 512x768 | 512 × 768 | Portrait, posters |
| 1:2 | 512x1024 | 512 × 1024 | Tall vertical, mobile |
| 9:16 | 576x1024 | 576 × 1024 | Reels, stories |
| 3:4 | 768x1024 | 768 × 1024 | Comic covers |
| 4:3 | 1024x768 | 1024 × 768 | Landscape, dialogue panels |
| 3:2 | 768x512 | 768 × 512 | Cinematic landscape |
| 16:9 | 1024x576 | 1024 × 576 | Widescreen |
| 2:1 | 1024x512 | 1024 × 512 | Ultra-wide banners |

### 5.4 Presets

| Preset | Description |
|--------|-------------|
| `render` | Default style |
| `neutral` | Neutral/minimal style |

*Additional presets may be available on higher plans (500+ on Pro).*

---

## 6. Limitations

### 6.1 API Limitations

| Limitation | Details |
|------------|---------|
| **Single prompt per request** | One `prompt` or `promptUrl` per generation; no native per-panel API calls |
| **Per-panel control** | Achieved by structuring prompt with [Panels] section, not separate endpoints |
| **Character limit** | Creator/Pro: up to 3 characters; Scale: unlimited |
| **Upload file size** | Max 10 MB for reference images |
| **No video/document input in public API** | Video-to-comic, Epub/PDF/Word-to-comic are plan features, not documented in public API |

### 6.2 Plan-Dependent Features

| Feature | Free | Starter | Creator | Pro | Scale |
|---------|------|---------|---------|-----|-------|
| Text-to-comic | ✅ | ✅ | ✅ | ✅ | ✅ |
| Image-to-comic | ❌ | ❌ | ✅ | ✅ | ✅ |
| Character upload | ❌ | ❌ | 3 | 3 | Unlimited |
| Pre-made styles | ❌ | ❌ | ❌ | 500+ | 500+ |
| Video/Doc to comic | ❌ | ❌ | ❌ | ✅ | ✅ |
| Watermark | Yes | No | No | No | No |

### 6.3 Technical Limitations

| Limitation | Details |
|------------|---------|
| **Async only** | Generation is async; poll for status |
| **No webhooks** | Must poll; no push notifications |
| **Output format** | Image URL(s); format depends on API response |
| **No edit/regenerate** | Cannot edit existing generation; create new |

---

## 7. Rate Limits & Pricing

### 7.1 Demo (Free) Users

- 15 requests per day
- 4 requests per minute
- Watermarked outputs

### 7.2 Paid Plans

- 10 requests per minute
- Usage based on credits
- No watermark (high-resolution)

### 7.3 Status Lifecycle

| Status | Meaning |
|--------|---------|
| PENDING | Request accepted and queued |
| PROCESSING | Generation in progress |
| SUCCEEDED | Generation completed |
| FAILED | Generation failed |

**Recommendation:** Poll every 3–5 seconds with timeout and exponential backoff.

---

## 8. SDK Capabilities

**Package:** `npm i comic`

### 8.1 Client Setup

```javascript
import { LlamaGenClient } from 'comic';

const llamagen = new LlamaGenClient({
  apiKey: process.env.LLAMAGEN_API_KEY,
  baseURL: 'https://api.llamagen.ai/v1',  // optional
  timeoutMs: 30000,                         // optional
  maxRetries: 2,                            // optional
  retryDelayMs: 500,                        // optional
});
```

### 8.2 SDK Methods

| Method | Description |
|--------|-------------|
| `llamagen.comic.create(params)` | Create generation job |
| `llamagen.comic.get(id)` | Get generation by ID |
| `llamagen.comic.waitForCompletion(id, options?)` | Poll until complete |
| `llamagen.comic.createAndWait(params, options?)` | Create + wait in one call |
| `llamagen.comic.createBatch(paramsList, options?)` | Create multiple jobs |
| `llamagen.comic.waitForMany(ids, options?)` | Wait for multiple jobs |

### 8.3 MCP Integration

**Endpoint:** `https://llamagen.ai/api/mcp`

**Available tools:**
- `create_comic_generation` — Create a generation job
- `get_comic_generation_status` — Get status/result by ID
- `get_api_usage` — Get usage and quota

---

## 9. Prompt Best Practices

### 9.1 Recommended Structure

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

### 9.2 Tips

- Keep each panel objective explicit
- Avoid mixing too many styles in one request
- Reference character names in panel descriptions for consistency
- Use the structured template for stable, high-quality output

---

## 10. Error Handling

| Code | Description |
|------|-------------|
| 401 | Unauthorized — Invalid API token |
| 402 | Payment Required — Insufficient credits |
| 403 | Forbidden — Access denied |
| 429 | Too Many Requests — Rate limit exceeded |
| 500 | Internal Server Error |

---

## Summary: What Works vs. What Doesn't

### ✅ Supported in Public API

- Text-to-comic with custom preset, size, panel count
- Character consistency via `comicRoles` (name, age, gender, dress, image URL)
- Reference image upload for `promptUrl` or character images
- Per-panel control via structured prompt (single API call)
- Status polling and usage checks
- SDK with create, wait, batch support
- MCP for AI agents

### ❌ Not in Public API Docs / Plan-Dependent

- Separate per-panel API calls (use structured prompt instead)
- Video-to-comic (Pro+)
- Document-to-comic (Epub/PDF/Word) (Pro+)
- 500+ pre-made styles (Pro+)
- Webhooks
- More than 3 characters (Creator/Pro; Scale has unlimited)

---

*This document is based on the LlamaGen Comic API documentation as of March 2025. For the latest details, see [llamagen.ai/comic-api/docs](https://llamagen.ai/comic-api/docs).*
