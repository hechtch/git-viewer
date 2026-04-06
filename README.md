# git-viewer

A local web app for browsing Git repositories. Visualizes commit history, branch graphs, file trees, diffs, and repo status in a clean Angular UI backed by a lightweight Node/Express API.

## Features

- Commit graph with branch/tag labels
- Branch list with local vs. remote divergence status
- Commit log and diff viewer
- File tree browser
- Repo status panel (working tree changes)
- Settings panel with configurable watermarks
- Multi-repo support — switch repos at runtime without restart
- Containerized for easy deployment

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Angular (TypeScript) |
| Backend | Node.js + Express (TypeScript) |
| Runtime | Git CLI (via `child_process`) |

## Getting Started

### Prerequisites

- Node.js 18+
- Git

### Run locally

```bash
make install
make run
```

Opens at http://localhost:4200 (frontend dev server proxying to backend on :3000).

You can set the initial repository via environment variable:

```bash
GIT_REPO_PATH=/path/to/repo make run
```

If `GIT_REPO_PATH` is not set, a landing page lets you browse and select a repo at runtime.

## Makefile targets

| Target | Description |
|--------|-------------|
| `make install` | Install all dependencies |
| `make run` | Start frontend + backend (foreground) |
| `make run-bg` | Backend in background, frontend in foreground |
| `make build` | Build all artifacts |
| `make test` | Run all tests with coverage |
| `make lint` | Run all linters |
| `make clean` | Remove build artifacts and node_modules |

## Container

```bash
# Build
make container-build

# Run against a local repo
docker run -v /path/to/your/repo:/repo -p 3000:3000 git-viewer

# Or using make
make container-run
```

The container serves the Angular app and API together on port 3000.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GIT_REPO_PATH` | _(none)_ | Path to the Git repository to open on startup |
| `PORT` | `3000` | Port the backend/container listens on |
