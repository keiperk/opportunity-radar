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
  reddit: '#5fa83f', // matches --reddit-red, used for the radar blips
  purple: '#9b7cc4', // matches --gauge-accent, used for the roles gauge ring
  trendAccent: '#6f9d6a', // matches --trend-accent, used for the momentum trend chart
};

/* Last-known-good snapshot (pipeline runs 59-72) — used only if the live
   fetch fails, so the page degrades gracefully instead of breaking.
   Full multi-run history (not just the latest run) so Momentum Trend
   charts still have real data to plot even in fallback mode. Refreshed
   2026-07-15 from the live sheet; the 2 rows the pipeline mangled into
   full sentences instead of company names were dropped, matching what
   isValidCompanyRow does to live data anyway. */
const FALLBACK_ROWS = [
  { run_id: '59', run_ts: '2026-07-14T09:42:07.029-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '9', reddit_signals: '0', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.033-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.035-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '0', reddit_signals: '0', linkedin_signals: '9', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.036-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.037-07:00', company_canonical: 'venice', company_display: 'Venice AI', news_signals: '9', reddit_signals: '10', linkedin_signals: '0', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.038-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.040-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.041-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.042-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.043-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '59', run_ts: '2026-07-14T09:42:07.044-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '10', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '12', discovery_source: 'discovered' },
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
  { run_id: '61', run_ts: '2026-07-14T11:47:15.058-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.062-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.064-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.065-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.066-07:00', company_canonical: 'venice', company_display: 'Venice AI', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.068-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.071-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '10', reddit_signals: '0', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.072-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.073-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '9', linkedin_signals: '8', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.075-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '0', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.076-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '61', run_ts: '2026-07-14T11:47:15.077-07:00', company_canonical: 'allbirds', company_display: 'Allbirds', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '1', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.200-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.206-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.207-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.208-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.209-07:00', company_canonical: 'venice', company_display: 'Venice', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.211-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '10', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.212-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.214-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.215-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.216-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.217-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '62', run_ts: '2026-07-14T12:27:41.220-07:00', company_canonical: 'allbirds', company_display: 'Allbirds', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '1', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.284-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.290-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.292-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.293-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.294-07:00', company_canonical: 'venice', company_display: 'Venice', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.296-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.297-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.298-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.300-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.301-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.303-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '63', run_ts: '2026-07-14T12:39:20.305-07:00', company_canonical: 'allbirds', company_display: 'Allbirds', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '1', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.932-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.938-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.939-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.940-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.941-07:00', company_canonical: 'venice', company_display: 'Venice AI', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.942-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.943-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.945-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '10', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.946-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.947-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '64', run_ts: '2026-07-14T13:13:03.948-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.414-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.419-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.420-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.422-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.423-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.424-07:00', company_canonical: 'orbitalindustries', company_display: 'Orbital Industries', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.426-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.427-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.428-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '10', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.429-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '65', run_ts: '2026-07-14T13:20:15.430-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '0', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.563-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.569-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.571-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.572-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.574-07:00', company_canonical: 'venice', company_display: 'Venice AI', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.575-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.577-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.578-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.579-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '10', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.581-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '66', run_ts: '2026-07-14T13:29:43.582-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '0', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.539-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.541-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.542-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.543-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.544-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '9', reddit_signals: '8', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.545-07:00', company_canonical: 'orbitalindustries', company_display: 'Orbital Industries', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.546-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.547-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '10', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.548-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.549-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.551-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '0', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '67', run_ts: '2026-07-14T13:47:11.552-07:00', company_canonical: 'allbirdsstartup', company_display: 'Allbirds AI startup', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.564-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.568-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.569-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.570-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.572-07:00', company_canonical: 'venice', company_display: 'Venice AI', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.573-07:00', company_canonical: 'twenty', company_display: 'Twenty', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.574-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.575-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '16', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.576-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.577-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.578-07:00', company_canonical: 'refiant', company_display: 'Refiant AI', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '68', run_ts: '2026-07-14T14:22:25.579-07:00', company_canonical: 'allbirds', company_display: 'Allbirds', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '1', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.269-07:00', company_canonical: 'emergent', company_display: 'Emergent', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.271-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.274-07:00', company_canonical: 'cyclops', company_display: 'Cyclops', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.275-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.277-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.278-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '10', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.279-07:00', company_canonical: 'venice', company_display: 'Venice AI', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.280-07:00', company_canonical: 'launchmeloud', company_display: 'LaunchMeLoud', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.282-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.283-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '14', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.284-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '10', linkedin_signals: '8', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.286-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.287-07:00', company_canonical: 'nativeanalyticsstartup', company_display: 'AI-native analytics startup', news_signals: '8', reddit_signals: '8', linkedin_signals: '10', github_signals: '2', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.290-07:00', company_canonical: 'startupbyformerallbirdsceo', company_display: 'AI Startup by former Allbirds CEO', news_signals: '8', reddit_signals: '10', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '70', run_ts: '2026-07-15T13:32:43.291-07:00', company_canonical: 'unspecifiedstartupbyformertargetexecutive', company_display: 'Unspecified AI startup by former Target executive', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.625-07:00', company_canonical: 'emergent', company_display: 'Emergent', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.627-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.629-07:00', company_canonical: 'cyclops', company_display: 'Cyclops', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.630-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.631-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.632-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.633-07:00', company_canonical: 'venice', company_display: 'Venice AI', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.635-07:00', company_canonical: 'launchmeloud', company_display: 'LaunchMeLoud', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.636-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.637-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '14', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.639-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.640-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '71', run_ts: '2026-07-15T13:58:16.641-07:00', company_canonical: 'allbirdsstartup', company_display: 'Allbirds AI startup', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.604-07:00', company_canonical: 'emergent', company_display: 'Emergent', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '3', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.605-07:00', company_canonical: 'helsing', company_display: 'Helsing', news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.608-07:00', company_canonical: 'cyclops', company_display: 'Cyclops', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.609-07:00', company_canonical: 'auger', company_display: 'Auger', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '2', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.610-07:00', company_canonical: 'oratechnologies', company_display: 'ORA Technologies', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.611-07:00', company_canonical: 'jessebens', company_display: "Jesse & Ben's", news_signals: '9', reddit_signals: '10', linkedin_signals: '10', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.612-07:00', company_canonical: 'venice', company_display: 'Venice AI', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.613-07:00', company_canonical: 'launchmeloud', company_display: 'LaunchMeLoud', news_signals: '10', reddit_signals: '10', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.614-07:00', company_canonical: 'zml', company_display: 'ZML', news_signals: '10', reddit_signals: '10', linkedin_signals: '10', github_signals: '30', hn_signals: '20', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.615-07:00', company_canonical: 'attribute', company_display: 'Attribute', news_signals: '9', reddit_signals: '9', linkedin_signals: '10', github_signals: '30', hn_signals: '14', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.616-07:00', company_canonical: 'undocapital', company_display: 'Undo Capital', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.617-07:00', company_canonical: 'nautis', company_display: 'Nautis', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '30', hn_signals: '0', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.618-07:00', company_canonical: 'allbirds', company_display: 'Allbirds', news_signals: '9', reddit_signals: '10', linkedin_signals: '9', github_signals: '30', hn_signals: '1', discovery_source: 'discovered' },
  { run_id: '72', run_ts: '2026-07-15T14:51:43.620-07:00', company_canonical: 'startuplaunchedbyformertargetexecutive', company_display: 'AI startup launched by former Target executive', news_signals: '9', reddit_signals: '9', linkedin_signals: '9', github_signals: '0', hn_signals: '0', discovery_source: 'discovered' },
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
  return `<strong>${escapeXml(c.company)}</strong> is showing ${tierPhrase} combined signal this scan — driven primarily by ${top.label.toLowerCase()} activity (<span class="num">${top.value}</span> mentions) across news, community, and hiring channels. ${timingPhrase} That combination usually means ${growthPhrase}.`;
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
