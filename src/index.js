import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import Parser from 'rss-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const STATE_FILE = resolve(ROOT, 'state.json');
const FEEDS_FILE = resolve(ROOT, 'feeds.yml');
const NEW_ITEMS_FILE = resolve(ROOT, 'new-items.json');

const parser = new Parser({ timeout: 15000 });

// --- State management ---

function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// --- Feed loading ---

function loadFeeds() {
  const raw = readFileSync(FEEDS_FILE, 'utf-8');
  const doc = yaml.load(raw);
  return (doc.feeds || []).filter(f => f.enabled !== false);
}

// --- Core check ---

async function checkFeeds() {
  const feeds = loadFeeds();
  const state = loadState();
  const allNewItems = [];

  for (const feed of feeds) {
    const lastSeen = state[feed.url] || null;
    let newLastSeen = lastSeen;

    try {
      const parsed = await parser.parseURL(feed.url);
      const items = (parsed.items || [])
        .map(item => ({
          ...item,
          _date: item.isoDate ? new Date(item.isoDate) : null,
        }))
        .sort((a, b) => ((b._date?.getTime() || 0) - (a._date?.getTime() || 0)));

      const feedNewItems = [];

      for (const item of items) {
        const itemDate = item._date?.toISOString() || null;

        if (lastSeen && itemDate && itemDate <= lastSeen) break;
        if (lastSeen && !itemDate) continue;

        feedNewItems.push({
          feedName: feed.name,
          title: item.title || '(no title)',
          link: item.link || '',
          date: item.isoDate || '',
          summary: item.contentSnippet || item.content || '',
        });

        if (itemDate && (!newLastSeen || itemDate > newLastSeen)) {
          newLastSeen = itemDate;
        }
      }

      // First run: record state, don't emit items
      if (!lastSeen && items.length > 0) {
        const newest = items[0]._date?.toISOString();
        if (newest) state[feed.url] = newest;
        console.log(`[init] ${feed.name}: recorded state (${items.length} items)`);
      } else {
        allNewItems.push(...feedNewItems);
        if (newLastSeen) state[feed.url] = newLastSeen;
        console.log(`[check] ${feed.name}: ${feedNewItems.length} new items`);
      }
    } catch (err) {
      console.error(`[error] ${feed.name}: ${err.message}`);
    }
  }

  saveState(state);

  // Write new items for the agent to pick up
  writeFileSync(NEW_ITEMS_FILE, JSON.stringify(allNewItems, null, 2));
  console.log(`[done] ${allNewItems.length} new items written to new-items.json`);
}

await checkFeeds();
