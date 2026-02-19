# RSS-to-Email Bridge 📡

Monitors RSS feeds and sends digest emails when new items are published.

## Setup

```bash
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

| Variable | Description | Default |
|---|---|---|
| `EMAIL_API_ENDPOINT` | Email sender API URL | required |
| `EMAIL_API_KEY` | API Bearer token | required |
| `EMAIL_RECIPIENT` | Recipient email (optional, depends on API) | — |
| `CHECK_INTERVAL` | Minutes between checks | 30 |

## Usage

```bash
# Run continuously (checks every CHECK_INTERVAL minutes)
npm start

# Single check (for cron/systemd timer)
npm run check
```

## How it works

1. Reads feed list from `feeds.yml`
2. Fetches each feed and compares against `state.json` (last seen dates)
3. On first run, records state without sending (avoids flooding)
4. If new items found, sends a single HTML digest email
5. Waits and repeats

## Running as a service

```bash
# systemd example
sudo cp rss-to-email.service /etc/systemd/system/
sudo systemctl enable --now rss-to-email
```

## State

`state.json` tracks the last-seen date per feed URL. Delete it to reset (next run will re-initialize without sending).
