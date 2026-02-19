import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import Parser from 'rss-parser';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const STATE_FILE = resolve(ROOT, 'state.json');
const FEEDS_FILE = resolve(ROOT, 'feeds.yml');

const {
  EMAIL_API_ENDPOINT,
  EMAIL_API_KEY,
  EMAIL_RECIPIENT,
} = process.env;

if (!EMAIL_API_ENDPOINT || !EMAIL_API_KEY) {
  console.error('Missing EMAIL_API_ENDPOINT or EMAIL_API_KEY in .env');
  process.exit(1);
}

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

// --- Email sending ---

async function sendEmail(subject, body) {
  const res = await fetch(EMAIL_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EMAIL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject,
      body,
      ...(EMAIL_RECIPIENT ? { to: EMAIL_RECIPIENT } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Email send failed (${res.status}): ${text}`);
  }
  return res.json().catch(() => ({}));
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

      for (const item of items) {
        const itemDate = item._date?.toISOString() || null;
        const itemId = item.guid || item.link || item.title;

        // If we have a last-seen date, skip items older or equal
        if (lastSeen && itemDate && itemDate <= lastSeen) break;
        // If no date and we had state, use link/guid dedup (first run captures all)
        if (lastSeen && !itemDate) continue;

        allNewItems.push({
          feedName: feed.name,
          title: item.title || '(no title)',
          link: item.link || '',
          date: item.isoDate || '',
          summary: item.contentSnippet || item.content || '',
        });

        // Track newest date
        if (itemDate && (!newLastSeen || itemDate > newLastSeen)) {
          newLastSeen = itemDate;
        }
      }

      // First run: just record state, don't send anything
      if (!lastSeen && items.length > 0) {
        const newest = items[0]._date?.toISOString();
        if (newest) state[feed.url] = newest;
        console.log(`[init] ${feed.name}: recorded state (${items.length} items)`);
        continue;
      }

      if (newLastSeen) state[feed.url] = newLastSeen;
      console.log(`[check] ${feed.name}: ${allNewItems.filter(i => i.feedName === feed.name).length} new items`);
    } catch (err) {
      console.error(`[error] ${feed.name}: ${err.message}`);
    }
  }

  saveState(state);

  if (allNewItems.length === 0) {
    console.log('[digest] No new items, skipping email');
    return;
  }

  // Build HTML email
  const html = buildDigestHtml(allNewItems);
  const subject = `📡 RSS Digest: ${allNewItems.length} new item${allNewItems.length > 1 ? 's' : ''}`;

  console.log(`[digest] Sending email with ${allNewItems.length} items...`);
  await sendEmail(subject, html);
  console.log('[digest] ✅ Email sent');
}

// --- HTML builder ---

function buildDigestHtml(items) {
  // Group by feed
  const grouped = {};
  for (const item of items) {
    if (!grouped[item.feedName]) grouped[item.feedName] = [];
    grouped[item.feedName].push(item);
  }

  let html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
  <h1 style="border-bottom: 2px solid #333; padding-bottom: 10px;">📡 RSS Digest</h1>
  <p style="color: #666;">${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })} · ${items.length} new item${items.length > 1 ? 's' : ''}</p>
`;

  for (const [feedName, feedItems] of Object.entries(grouped)) {
    html += `<h2 style="color: #1a1a2e; margin-top: 30px;">${esc(feedName)}</h2>`;
    for (const item of feedItems) {
      const snippet = item.summary.length > 300
        ? item.summary.slice(0, 300) + '…'
        : item.summary;
      html += `
  <div style="margin: 15px 0; padding: 12px; background: #f8f9fa; border-left: 3px solid #667eea; border-radius: 4px;">
    <a href="${esc(item.link)}" style="color: #667eea; text-decoration: none; font-weight: 600; font-size: 16px;">${esc(item.title)}</a>
    ${item.date ? `<div style="color: #999; font-size: 12px; margin-top: 4px;">${new Date(item.date).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</div>` : ''}
    ${snippet ? `<div style="color: #444; font-size: 14px; margin-top: 8px; line-height: 1.5;">${esc(snippet)}</div>` : ''}
  </div>`;
    }
  }

  html += `</div>`;
  return html;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Git state management ---

async function commitAndPushState() {
  const { execSync } = await import('child_process');
  const opts = { cwd: ROOT, stdio: 'pipe' };

  // Check if state.json changed
  try {
    execSync('git diff --quiet state.json', opts);
    console.log('[git] No state changes to commit');
    return;
  } catch {
    // diff found changes — continue
  }

  try {
    execSync('git add state.json', opts);
    execSync('git commit -m "Update feed state"', opts);
    execSync('git push', opts);
    console.log('[git] ✅ State committed and pushed');
  } catch (err) {
    console.error(`[git] Failed to push state: ${err.message}`);
  }
}

// --- Main ---

console.log('RSS-to-Email bridge: checking feeds...');
await checkFeeds();
await commitAndPushState();
