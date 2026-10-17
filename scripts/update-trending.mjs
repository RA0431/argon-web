// Builds trending.json for the Argon app. Runs every hour on GitHub (.github/workflows/update-trending.yml).
//
//  - YouTube: the most-watched music videos in India right now (YouTube Data API, key from the
//    YT_API_KEY secret — it stays on GitHub and is never inside the app).
//  - Apple Music: India "most played" chart (free, no key).
//  Every song is matched to JioSaavn here, so the app only has to load the matched songs.
//  If a source fails, the songs from the previous hour are kept.
import { readFile, writeFile } from 'node:fs/promises';

const YT_KEY = process.env.YT_API_KEY || '';
const REGION = (process.env.REGION || 'IN').toUpperCase();
const OUT = new URL('../trending.json', import.meta.url);
const SAAVN = ['https://jiosavan-api2.vercel.app/api', 'https://saavn.sumit.co/api', 'https://saavn.dev/api'];

async function getJSON(url, timeout = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

let saavnBase = 0;
async function saavn(path) {
  for (let i = 0; i < SAAVN.length; i++) {
    const b = (saavnBase + i) % SAAVN.length;
    try {
      const j = await getJSON(SAAVN[b] + path);
      if (j?.success) { saavnBase = b; return j.data; }
    } catch { /* next server */ }
  }
  return null;
}

/* ---- text helpers (same rules as the app) ---- */
const decode = (s) => String(s || '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const norm = (x) => decode(x).toLowerCase()
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\((from|feat|ft)[^)]*\)|\[[^\]]*\]/g, ' ')
  .replace(/[^a-z0-9ऀ-ॿ]+/g, ' ')
  .trim();
// "Song Name (Official Video) | Movie | Singer" → "Song Name"
const cleanTitle = (t) => decode(t)
  .replace(/\(.*?\)|\[.*?\]/g, ' ')
  .split(/[|｜]/)[0]
  .replace(/\b(official|music|video|lyrical|lyrics|full song|audio|4k|hd|new song|song)\b/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* ---- sources ---- */
async function youtubeTop() {
  if (!YT_KEY) { console.log('YouTube: no YT_API_KEY secret, skipped'); return null; }
  const url = 'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular'
    + `&regionCode=${REGION}&videoCategoryId=10&maxResults=25&key=${encodeURIComponent(YT_KEY)}`;
  const d = await getJSON(url);
  return (d.items || []).map((v) => ({
    title: cleanTitle(v.snippet?.title || ''),
    artist: '',
    channel: v.snippet?.channelTitle || '',
    videoId: v.id,
    views: Number(v.statistics?.viewCount) || 0,
  })).filter((x) => x.title);
}

async function appleTop() {
  const d = await getJSON(`https://rss.marketingtools.apple.com/api/v2/${REGION.toLowerCase()}/music/most-played/25/songs.json`);
  return (d?.feed?.results || []).map((r) => ({ title: decode(r.name), artist: decode(r.artistName) })).filter((x) => x.title);
}

/* ---- find each song on JioSaavn ---- */
async function matchOnSaavn({ title, artist }) {
  const t = cleanTitle(title);
  const a = String(artist || '').split(/,|&| x | feat\.?| ft\.?/i)[0].trim();
  if (!t) return null;
  const d = await saavn(`/search/songs?query=${encodeURIComponent(`${t} ${a}`.trim())}&limit=6`);
  const nt = norm(t);
  const na = norm(a).split(' ')[0];
  let best = null;
  let bestScore = 0;
  (d?.results || []).forEach((s) => {
    const st = norm(s.name);
    let sc = st === nt ? 3 : st.startsWith(nt) || nt.startsWith(st) ? 2 : st.includes(nt) || nt.includes(st) ? 1 : 0;
    if (!sc) return;
    const artists = norm((s.artists?.primary || []).map((x) => x.name).join(' '));
    if (na && artists.includes(na)) sc += 1.5;
    sc += Math.log10((Number(s.playCount) || 0) + 10) / 20;
    if (sc > bestScore) { bestScore = sc; best = s; }
  });
  return bestScore >= 2 ? { saavnId: best.id, saavnTitle: decode(best.name) } : null;
}

async function withMatches(items) {
  const out = [];
  for (let i = 0; i < items.length; i += 5) { // 5 at a time, gentle on the servers
    const part = items.slice(i, i + 5);
    const found = await Promise.all(part.map((it) => matchOnSaavn(it).catch(() => null)));
    part.forEach((it, j) => out.push({ ...it, ...(found[j] || { saavnId: null }) }));
  }
  return out;
}

/* ---- main ---- */
const previous = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => ({}));
const result = { updated: new Date().toISOString(), region: REGION, youtube: previous.youtube || [], apple: previous.apple || [] };

for (const [name, load] of [['youtube', youtubeTop], ['apple', appleTop]]) {
  try {
    const items = await load();
    if (items === null) continue;
    if (!items.length) throw new Error('empty list');
    result[name] = await withMatches(items);
    const matched = result[name].filter((x) => x.saavnId).length;
    console.log(`${name}: ${items.length} songs, ${matched} found on JioSaavn`);
  } catch (e) {
    console.log(`${name}: failed (${e.message}) — keeping the previous list`);
  }
}

await writeFile(OUT, JSON.stringify(result, null, 1) + '\n');
console.log('trending.json written');
