# RSS-to-Email Bridge 📡

Agent-driven RSS digest system. A cron job triggers the agent, which checks feeds, generates a curated summary, and sends it via email.

## How it works

1. **OpenClaw cron** triggers the agent every 30 minutes
2. Agent runs `npm run check` — fetches feeds, compares against `state.json`, writes new items to `new-items.json`
3. Agent reads `new-items.json` and `template.html` to generate an HTML digest email
4. Agent sends the email via `scripts/send-email.sh` (existing workspace tool)
5. Agent commits and pushes `state.json` + clears `new-items.json`

## Files

| File | Purpose |
|---|---|
| `feeds.yml` | Subscribed feeds list |
| `state.json` | Last-seen dates per feed (committed to repo) |
| `new-items.json` | New items from latest check (transient) |
| `template.html` | Email HTML template reference |
| `src/index.js` | Feed checker script (no email logic) |

## Setup

```bash
git clone https://github.com/amplibatu/rss-to-email.git
cd rss-to-email
npm install
```

No `.env` needed for the script itself — email sending is handled by the agent via existing workspace scripts.

## Adding feeds

Edit `feeds.yml`:

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

## State

`state.json` is committed to the repo — state persists across machines. Reset by pushing `{}`.
