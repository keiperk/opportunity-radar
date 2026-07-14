/*
 * Shared data + scoring logic for the Opportunity Radar dashboard and
 * detail page. Formula matches the pipeline's `Calculate Index` node as of
 * the GitHub/HN fix: weights news .25 / reddit .20 / linkedin .25 /
 * github .15 / hn .15, each source capped independently before
 * normalizing.
 *
 * Data is fetched live from the pipeline's published `radar_results`
 * sheet (see CSV_URL below) — this is a real, ongoing connection, not a
 * static snapshot. If the live fetch fails, FALLBACK_ROWS (a last-known-
 * good snapshot) is used instead so the page never just breaks; callers
 * can check `dataSource` to know which happened.
 */
const CAPS = { news: 10, reddit: 10, linkedin: 15, github: 30, hn: 10 };
const WEIGHTS = { news: 0.25, reddit: 0.20, linkedin: 0.25, github: 0.15, hn: 0.15 };

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGAgujnKii4qOQYezhAMdwFcsAnLOeg_jnZtE8lOHm2dexXdH0tWtwqKeZbhPxov_Z9YzQGEH2mS2C/pub?gid=1454866921&single=true&output=csv';

/*
 * Single source of truth for the accent color, shared by styles.css (via
 * the matching --accent custom properties — keep these in sync manually,
 * since CSS custom properties aren't readable from raw SVG string
 * templates) and the JS-rendered SVG (radar, trend chart) in app.js /
 * detail.js. Change the color here and in styles.css :root together.
 */
const THEME = {
  accent: '#607d8b',     // Material Blue Grey 500 — matches --accent
  accentDeep: '#455a64', // Material Blue Grey 700 — matches --accent-deep
  accentTint: '#eceff1', // Material Blue Grey 50  — matches --accent-tint
  dark: '#0d1219', // matches --text-primary
  amber: '#f59e0b',
  rose: '#f87171',
  border: '#d3dee4', // matches --border, used for gauge track
  mutedDot: '#9aa7ae', // matches --peer-muted-dot, used for peer comparison dots
  reddit: '#d9694f', // matches --reddit-red, used for the radar blips
  purple: '#9b7cc4', // matches --gauge-accent, used for the roles gauge ring
  trendAccent: '#6f9d6a', // matches --trend-accent, used for the momentum trend chart
};

/* Last-known-good snapshot (pipeline run 60) — used only if the live
   fetch fails, so the page degrades gracefully instead of breaking. */
const FALLBACK_ROWS = [
  { run_id: '60', run_ts: '2026-07-14T11:15:17.743-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.744-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.746-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.747-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.748-07:00', company_canonical: 'venice', company_display: 'Venice AI', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.749-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.750-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.751-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.752-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '10', reddit_signals: '10', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.754-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '10', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '60', run_ts: '2026-07-14T11:15:17.755-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '10', reddit_signals: '10', linkedin_signals: '9', github_signals: '0', hn_signals: '2', discovery_source: 'discovered' },
];

let companies = [];
let runMeta = { run_id: null, run_ts: null };
let dataSource = 'loading'; // 'loading' | 'live' | 'fallback'

function computeIndex(news, reddit, linkedin, github, hn) {
  const n = Math.min(news, CAPS.news) / CAPS.news;
  const r = Math.min(reddit, CAPS.reddit) / CAPS.reddit;
  const l = Math.min(linkedin, CAPS.linkedin) / CAPS.linkedin;
  const g = Math.min(github, CAPS.github) / CAPS.github;
  const h = Math.min(hn, CAPS.hn) / CAPS.hn;
  return n * WEIGHTS.news + r * WEIGHTS.reddit + l * WEIGHTS.linkedin + g * WEIGHTS.github + h * WEIGHTS.hn;
}

/* Each source's actual weighted contribution to opportunity_index — the
   5 parts that sum to the composite score shown in the math panel. */
function computeContributions(c) {
  return {
    news: (Math.min(c.news_signals, CAPS.news) / CAPS.news) * WEIGHTS.news,
    reddit: (Math.min(c.reddit_signals, CAPS.reddit) / CAPS.reddit) * WEIGHTS.reddit,
    linkedin: (Math.min(c.linkedin_signals, CAPS.linkedin) / CAPS.linkedin) * WEIGHTS.linkedin,
    github: (Math.min(c.github_signals, CAPS.github) / CAPS.github) * WEIGHTS.github,
    hn: (Math.min(c.hn_signals, CAPS.hn) / CAPS.hn) * WEIGHTS.hn,
  };
}

function tierOf(idx) {
  if (idx >= 0.8) return 'Very Strong';
  if (idx >= 0.6) return 'Strong';
  if (idx >= 0.4) return 'Moderate';
  if (idx >= 0.2) return 'Weak';
  return 'Very Weak';
}

function tierClass(tier) {
  if (tier === 'Very Strong' || tier === 'Strong') return 'green';
  if (tier === 'Moderate') return 'amber';
  return 'rose';
}

function findCompany(name) {
  return companies.find((c) => c.company === name) || null;
}

/*
 * LinkedIn Jobs signal, by definition, only registers once a role is
 * already posted publicly — it's confirmation, not an early signal.
 * Every other source (funding news, community chatter, engineering
 * activity) can show up before a company starts hiring, so they're
 * grouped as "leading" — the earlier, more valuable signal for finding
 * opportunities before they become job postings.
 */
const SOURCE_TIMING = { news: 'leading', reddit: 'leading', github: 'leading', hn: 'leading', linkedin: 'confirming' };

function generateWhyItMatters(c) {
  const sources = [
    { key: 'news', label: 'News', value: c.news_signals },
    { key: 'reddit', label: 'Reddit', value: c.reddit_signals },
    { key: 'linkedin', label: 'LinkedIn', value: c.linkedin_signals },
    { key: 'github', label: 'GitHub', value: c.github_signals },
    { key: 'hn', label: 'Hacker News', value: c.hn_signals },
  ];
  const top = sources.reduce((a, b) => (b.value > a.value ? b : a));
  const tierPhrase = c.tier.toLowerCase();
  const growthPhrase = c.tier === 'Very Strong' || c.tier === 'Strong'
    ? 'active headcount growth rather than a single one-off signal spike, making it a reasonable near-term target for outreach'
    : 'some hiring-adjacent activity, though the signal is not yet strong enough to be a confident outreach priority';
  const timingPhrase = SOURCE_TIMING[top.key] === 'leading'
    ? `That's a leading signal — it can show up before any role is publicly posted, so you may be finding this one early.`
    : `That's a confirming signal — LinkedIn activity like this usually means a role is already posted, so the opportunity is real but timing is less in your favor.`;
  return `<strong>${escapeXml(c.company)}</strong> is showing ${tierPhrase} combined signal this scan — driven primarily by ${top.label.toLowerCase()} activity (${top.value} mentions) across news, community, and hiring channels. ${timingPhrase} That combination usually means ${growthPhrase}.`;
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Live data loading ──────────────────────────────────────────────── */

/* Minimal CSV parser — handles quoted fields (embedded commas, escaped
   quotes) since company names could contain either. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.length === header.length)
    .map((r) => {
      const obj = {};
      header.forEach((h, idx) => { obj[h] = r[idx]; });
      return obj;
    });
}

/* Rejects malformed rows — e.g. the discovery LLM has, at least once,
   extracted an entire sentence as a "company name" instead of an actual
   name. Real company names are short; anything wildly long is discarded
   rather than shown as a fake company. */
function isValidCompanyRow(row) {
  if (!row.company_canonical || !row.company_display) return false;
  if (row.company_display.length > 60) return false;
  if (!row.run_id || !row.run_ts) return false;
  return true;
}

/* Groups raw CSV rows by company, computing the current (latest-run)
   snapshot per company plus its full real history (every past run) for
   genuine trend charts — no synthetic/illustrative data involved. */
function buildCompaniesFromRows(rows) {
  const grouped = {};
  rows.forEach((row) => {
    const key = row.company_canonical;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  });

  let latestRunTs = null, latestRunId = null;

  const built = Object.values(grouped).map((runs) => {
    runs.sort((a, b) => new Date(a.run_ts) - new Date(b.run_ts));

    const history = runs.map((r) => {
      const index = computeIndex(
        Number(r.news_signals) || 0,
        Number(r.reddit_signals) || 0,
        Number(r.linkedin_signals) || 0,
        Number(r.github_signals) || 0,
        Number(r.hn_signals) || 0
      );
      return { run_id: r.run_id, run_ts: r.run_ts, index };
    });

    const latest = runs[runs.length - 1];
    const news = Number(latest.news_signals) || 0;
    const reddit = Number(latest.reddit_signals) || 0;
    const linkedin = Number(latest.linkedin_signals) || 0;
    const github = Number(latest.github_signals) || 0;
    const hn = Number(latest.hn_signals) || 0;
    const index = computeIndex(news, reddit, linkedin, github, hn);

    if (!latestRunTs || new Date(latest.run_ts) > new Date(latestRunTs)) {
      latestRunTs = latest.run_ts;
      latestRunId = latest.run_id;
    }

    return {
      company: latest.company_display,
      news_signals: news,
      reddit_signals: reddit,
      linkedin_signals: linkedin,
      github_signals: github,
      hn_signals: hn,
      discovery_source: latest.discovery_source || 'tracked',
      opportunity_index: Math.round(index * 100) / 100,
      opportunity_index_precise: index,
      tier: tierOf(index),
      history,
    };
  });

  return { companies: built, runMeta: { run_id: latestRunId, run_ts: latestRunTs } };
}

/* Fetches the live published sheet; falls back to the last-known-good
   snapshot if the fetch fails or returns nothing usable. Always
   resolves (never rejects) so callers don't need their own fallback. */
function loadCompanyData() {
  return fetch(CSV_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      return res.text();
    })
    .then((text) => {
      const rows = parseCSV(text).filter(isValidCompanyRow);
      if (!rows.length) throw new Error('No valid rows in live data');
      const built = buildCompaniesFromRows(rows);
      companies = built.companies;
      runMeta = built.runMeta;
      dataSource = 'live';
      return companies;
    })
    .catch((err) => {
      console.warn('Live data fetch failed, using fallback snapshot:', err);
      const rows = FALLBACK_ROWS.filter(isValidCompanyRow);
      const built = buildCompaniesFromRows(rows);
      companies = built.companies;
      runMeta = built.runMeta;
      dataSource = 'fallback';
      return companies;
    });
}
