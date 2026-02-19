# RSS-to-Email Bridge 📡

Monitors RSS feeds and sends digest emails when new items are published. State is stored in the repo itself (`state.json`) and committed back after each run.

## Setup

```bash
git clone https://github.com/amplibatu/rss-to-email.git
cd rss-to-email
npm install
cp .env.example .env
# Edit .env with your API credentials
# Edit feeds.yml with your feeds
```

## Configuration

### feeds.yml

```yaml
feeds:
  - name: "Hacker News"
    url: "https://hnrss.org/frontpage"
  - name: "Lobsters"
    url: "https://lobste.rs/rss"
  - name: "Disabled Feed"
    url: "https://example.com/rss"
    enabled: false
```

### .env

| Variable | Description |
|---|---|
| `EMAIL_API_ENDPOINT` | Email sender API URL (required) |
| `EMAIL_API_KEY` | API Bearer token (required) |
| `EMAIL_RECIPIENT` | Recipient email (optional, depends on API) |

## Usage

```bash
# Single run: check feeds, send digest if new items, commit state
npm run check
```

## How it works

1. Reads feed list from `feeds.yml`
2. Fetches each feed and compares against `state.json` (last seen dates)
3. On first run, records state without sending (avoids flooding)
4. If new items found, sends a single HTML digest email
5. Commits and pushes updated `state.json` back to the repo

## Cron setup

```bash
# Check every 30 minutes
*/30 * * * * cd /path/to/rss-to-email && /usr/bin/node src/index.js
```

## State

`state.json` tracks the last-seen date per feed URL. It's committed to the repo so state persists across machines. Reset by setting it to `{}` and pushing.
