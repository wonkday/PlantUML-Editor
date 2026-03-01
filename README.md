# PlantUML Editor

A web-based PlantUML diagram editor with live preview, powered by [Kroki](https://kroki.io/) for server-side rendering. Features a built-in diagram sharing system via shareable links.

## Features

- **Live editor** with syntax highlighting (CodeMirror), auto-render, and configurable debounce
- **SVG preview** with zoom (mouse wheel + buttons), fit-to-view, and pan
- **Diagram sharing** via URL-encoded links (small diagrams) or server-stored short IDs (large diagrams)
- **Export** to SVG and PNG
- **Dark/light theme** toggle, persisted across sessions
- **Editor content caching** in localStorage (survives page reloads)
- **Collapsible panels** -- maximize editor or preview independently
- **Drag & drop** `.puml` files directly onto the page
- **Configurable Kroki API URL** via Settings

## Project Structure

```
PlantUML_Editor/
├── public/                   # Static frontend files
│   ├── puml.html             # Main editor with sharing (served at /)
│   └── editor.html           # Legacy standalone editor (/editor.html)
├── scripts/                  # Shell helper scripts
│   ├── start_kroki.sh        # Start Kroki container
│   ├── start_editor.sh       # Build & start editor container
│   └── restart_editor.sh     # Rebuild & restart editor container
├── data/                     # Shared diagram storage (runtime, gitignored)
├── server.js                 # Express server (static files + share API)
├── package.json
├── deploy.sh                 # Deploy with proxy settings
├── Dockerfile
├── docker-compose.yml
├── .gitignore
└── .dockerignore
```

## Prerequisites

- **Docker** and **Docker Compose**
- **Kroki** running on port 8000 (for PlantUML rendering)

## Quick Start

### 1. Start Kroki

```bash
bash scripts/start_kroki.sh
```

This runs `yuzutech/kroki` on port 8000.

### 2. Build & Start the Editor

```bash
bash scripts/start_editor.sh
```

Or if behind a corporate proxy:

```bash
bash deploy.sh
```

### 3. Access

| URL | Description |
|-----|-------------|
| `http://<host>:8001/` | Main editor with sharing |
| `http://<host>:8001/editor.html` | Legacy standalone editor |

## Sharing Diagrams

Click the **Share** button in the toolbar to generate a shareable link.

### Dual-mode sharing

| Mode | How it works | When used |
|------|-------------|-----------|
| **URL encoding** | Diagram compressed with pako + base64url into the URL hash | Diagram size <= configured limit (default 2000 chars) |
| **Server storage** | Diagram saved on server with a short ID | Diagram size > limit |

Share mode is configurable in **Settings** (Auto / URL only / Server only).

### Shared link formats

- `http://<host>:8001/#puml=<encoded>` -- URL-encoded (no server needed to decode)
- `http://<host>:8001/#id=<shortId>` -- server-stored

## Share API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/share` | POST | Save diagram, returns `{ id }` |
| `/api/share/:id` | GET | Retrieve diagram `{ content, created }` |
| `/api/share/:id` | DELETE | Delete a specific shared diagram |
| `/api/share/cleanup/expired` | DELETE | Manually trigger TTL cleanup |

## Configuration

### Environment Variables

Set in `docker-compose.yml` or pass at runtime:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8001` | Server listen port |
| `SHARE_TTL_DAYS` | `5` | Auto-delete shared diagrams older than N days (0 = disabled) |
| `SHARE_MAX_FILES` | `100` | Max number of stored shared diagrams (0 = unlimited) |
| `SHARE_MAX_SIZE_MB` | `20` | Max total storage in MB for shared diagrams (0 = unlimited) |

### Client-side Settings

Accessible via the **Settings** button in the toolbar (persisted in localStorage):

- Kroki PlantUML API URL
- Auto-render debounce (ms)
- Share mode (Auto / URL only / Server only)
- URL encoding size limit (chars)

## Cleanup Strategy

Shared diagrams in `data/` are managed by three mechanisms:

1. **Auto-expire (TTL)** -- hourly scheduled job deletes diagrams older than `SHARE_TTL_DAYS`
2. **Storage caps** -- on every new share, oldest files are evicted if `SHARE_MAX_FILES` or `SHARE_MAX_SIZE_MB` is exceeded
3. **Manual API** -- `DELETE /api/share/:id` or `DELETE /api/share/cleanup/expired`

## Local Development (without Docker)

```bash
npm install
node server.js
```

Runs on `http://localhost:8001`. Requires Kroki running separately on port 8000.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Render diagram |
| `Ctrl+S` | Save to disk |
| `Ctrl+Scroll` | Zoom preview |
| `Escape` | Close modals/popovers |

## Author

**Wonkday**
