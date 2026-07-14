/*
 * Shared data + scoring logic for the Opportunity Radar dashboard and
 * detail page. Formula matches the pipeline's `Calculate Index` node as of
 * the GitHub/HN fix: weights news .25 / reddit .20 / linkedin .25 /
 * github .15 / hn .15, each source capped independently before
 * normalizing. No live workflow connection — this is a static snapshot
 * from a pipeline rerun that includes real GitHub + Hacker News values.
 */
const CAPS = { news: 10, reddit: 10, linkedin: 15, github: 30, hn: 10 };
const WEIGHTS = { news: 0.25, reddit: 0.20, linkedin: 0.25, github: 0.15, hn: 0.15 };

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

const runMeta = {
  run_id: '58',
  run_ts: '2026-07-14T08:22:34.865-07:00',
  workflow_status: 'success',
};

/*
 * Real data from radar_results run_id 58. discoverySource is now a real
 * pipeline field (tagged at the Merge Tracking + Discovery Companies
 * step) — every company here is 'discovered' because the tracked-
 * companies sheet was intentionally cleared during a pipeline rebuild,
 * not because the field is fake. Once tracked companies are re-added,
 * this will differentiate normally.
 */
const rawCompanies = [
  { company: 'Helsing', news: 9, reddit: 10, linkedin: 10, github: 30, hn: 20, discoverySource: 'discovered' },
  { company: 'ORA Technologies', news: 10, reddit: 9, linkedin: 9, github: 30, hn: 20, discoverySource: 'discovered' },
  { company: 'Auger', news: 9, reddit: 10, linkedin: 10, github: 30, hn: 2, discoverySource: 'discovered' },
  { company: "Jesse & Ben's", news: 9, reddit: 10, linkedin: 10, github: 0, hn: 0, discoverySource: 'discovered' },
  { company: 'Venice AI', news: 9, reddit: 8, linkedin: 10, github: 30, hn: 0, discoverySource: 'discovered' },
  { company: 'Twenty', news: 10, reddit: 9, linkedin: 10, github: 30, hn: 3, discoverySource: 'discovered' },
  { company: 'ZML', news: 9, reddit: 10, linkedin: 10, github: 30, hn: 20, discoverySource: 'discovered' },
  { company: 'LaunchMeLoud', news: 9, reddit: 9, linkedin: 9, github: 0, hn: 0, discoverySource: 'discovered' },
  { company: 'Attribute', news: 10, reddit: 9, linkedin: 9, github: 30, hn: 16, discoverySource: 'discovered' },
  { company: 'Undo Capital', news: 9, reddit: 9, linkedin: 9, github: 0, hn: 0, discoverySource: 'discovered' },
  { company: 'Nautis', news: 9, reddit: 9, linkedin: 9, github: 30, hn: 0, discoverySource: 'discovered' },
  { company: 'Refiant AI', news: 9, reddit: 10, linkedin: 10, github: 0, hn: 2, discoverySource: 'discovered' },
];

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

const companies = rawCompanies.map((c) => {
  const index = computeIndex(c.news, c.reddit, c.linkedin, c.github, c.hn);
  const tier = tierOf(index);
  return {
    company: c.company,
    news_signals: c.news,
    reddit_signals: c.reddit,
    linkedin_signals: c.linkedin,
    github_signals: c.github,
    hn_signals: c.hn,
    discovery_source: c.discoverySource,
    opportunity_index: Math.round(index * 100) / 100,
    opportunity_index_precise: index,
    tier,
  };
});

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

/*
 * Illustrative trend history leading to each company's real, current
 * index — only the final point reflects a real pipeline run. Deterministic
 * per company (seeded by name, same shape every load) rather than one
 * fixed curve reused for every company, so charts aren't visibly identical.
 */
function generateTrendHistory(finalValue, seedKey) {
  let seed = 0;
  for (let i = 0; i < seedKey.length; i++) seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
  const noise = (i) => {
    const x = Math.sin(seed + i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  const ratios = [0.60, 0.75, 0.88].map((base, i) => {
    const jitter = (noise(i) - 0.5) * 0.18;
    return Math.max(0.35, Math.min(0.97, base + jitter));
  });
  return [finalValue * ratios[0], finalValue * ratios[1], finalValue * ratios[2], finalValue];
}

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
