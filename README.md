# DevPilot

AI-powered GitHub PR analyzer — a Chrome extension that injects a sidebar into GitHub PR pages, giving engineers instant context without leaving the page.

## Features

- **PR Summary** — Plain-English overview of what the PR does
- **Risk Analysis** — Flags security issues, missing tests, large blast radius
- **Linked Resources** — Related Jira tickets, GitHub issues, relevant docs
- **Reviewer Suggestions** — Recommends reviewers based on code ownership

## Architecture

```
Chrome Extension (content script)
        |
DevPilot Backend (Node.js / Express)
        |
Airia Agent (PR Summarizer, Risk Analyzer, Resource Linker, Reviewer Suggester)
```

## Project Structure

```
devpilot/
  extension/         # Chrome extension (Manifest V3, vanilla JS)
    manifest.json
    content.js
    popup.html
    popup.js
    sidebar.css
    icons/
  backend/           # Node.js / Express API server
    index.js
    routes/
      analyze.js
    services/
      github.js
      jira.js
      airia.js
    .env.example
    package.json
```

## Requirements

- Node.js >= 18
- Chrome browser
- [Airia](https://airia.com) account + API key
- GitHub Personal Access Token (scopes: `repo`, `read:org`)
- Jira account + API token (optional)

## Setup

### Backend

```bash
cd backend
cp .env.example .env
# Fill in your API keys in .env
npm install
npm run dev
```

### Extension

1. Open `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Click the DevPilot icon in your toolbar
6. Configure your GitHub token and backend URL in settings

## Usage

1. Navigate to any GitHub PR (e.g. `github.com/owner/repo/pull/123`)
2. DevPilot sidebar appears automatically on the right
3. Click **Analyze** or wait for auto-analysis
4. View Summary, Risks, Resources, and Reviewer suggestions

## Hackathon

Built for the [Airia AI Agent Challenge](https://airia.com) — Track 1: Airia Everywhere.
