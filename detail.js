/*
 * Detail page logic. Company data, scoring formula, and shared helpers
 * live in data.js (loaded before this file).
 */

function getSelectedCompanyFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get('company');
  return (name && findCompany(name)) || companies[0];
}

/* Everything below depends on live data, so it's wrapped in initDetailPage()
   and only runs after loadCompanyData() resolves — company/detail.html's
   old top-level code assumed `companies` was ready instantly, which broke
   once data started loading asynchronously from the live sheet. */
function initDetailPage() {
  const c = getSelectedCompanyFromUrl();
  if (!c) return; // no usable data even from fallback
  const cls = tierClass(c.tier);

  /* ── Header ── */
  document.getElementById('detail-name').textContent = c.company;
  document.getElementById('detail-blurb').textContent = getCompanyBlurb(c);
  document.title = `${c.company} — Company Detail`;

  const tierBadge = document.getElementById('detail-tier-badge');
  tierBadge.textContent = c.tier.toUpperCase();
  tierBadge.className = 'tier-badge' + (cls ? ` tier-${cls}` : '');

  const indexEl = document.getElementById('detail-index');
  indexEl.textContent = c.opportunity_index.toFixed(2);
  indexEl.style.color = cls === 'amber' ? 'var(--amber)' : cls === 'rose' ? 'var(--rose)' : 'var(--accent)';

  document.getElementById('detail-discovery-badge').hidden = c.discovery_source !== 'discovered';

  /* ── Prev / Next company nav (ranked by opportunity_index, same order as the dashboard's default sort) ── */
  const rankedForNav = companies.slice().sort((a, b) => b.opportunity_index_precise - a.opportunity_index_precise);
  const navIdx = rankedForNav.findIndex((co) => co.company === c.company);
  const prevCompany = rankedForNav[navIdx - 1];
  const nextCompany = rankedForNav[navIdx + 1];

  const prevBtn = document.getElementById('prev-company-btn');
  const nextBtn = document.getElementById('next-company-btn');
  if (prevCompany) {
    prevBtn.textContent = `← ${prevCompany.company}`;
    prevBtn.disabled = false;
    prevBtn.onclick = () => { window.location.href = `detail.html?company=${encodeURIComponent(prevCompany.company)}`; };
  } else {
    prevBtn.disabled = true;
  }
  if (nextCompany) {
    nextBtn.textContent = `${nextCompany.company} →`;
    nextBtn.disabled = false;
    nextBtn.onclick = () => { window.location.href = `detail.html?company=${encodeURIComponent(nextCompany.company)}`; };
  } else {
    nextBtn.disabled = true;
  }

  /* ── Signal Breakdown (compact rows — matches the dashboard's Company
     Inspector so the same widget doesn't look like two different things
     on two pages) ── */
  const sourceDefs = [
    { label: 'News', key: 'source-news', value: c.news_signals, cap: CAPS.news, weight: WEIGHTS.news },
    { label: 'Reddit', key: 'source-reddit', value: c.reddit_signals, cap: CAPS.reddit, weight: WEIGHTS.reddit },
    { label: 'LinkedIn', key: 'source-linkedin', value: c.linkedin_signals, cap: CAPS.linkedin, weight: WEIGHTS.linkedin },
    { label: 'GitHub', key: 'source-github', value: c.github_signals, cap: CAPS.github, weight: WEIGHTS.github },
    { label: 'Hacker News', key: 'source-hn', value: c.hn_signals, cap: CAPS.hn, weight: WEIGHTS.hn },
    { label: 'Executive Hires', key: 'source-exec_hire', value: c.exec_hire_signals, cap: CAPS.exec_hire, weight: WEIGHTS.exec_hire },
    { label: 'Funding', key: 'source-funding', value: c.funding_signals, cap: CAPS.funding, weight: WEIGHTS.funding },
    { label: 'Patents', key: 'source-patents', value: c.patent_signals, cap: CAPS.patents, weight: WEIGHTS.patents },
  ];
  /* Bar width is scaled against each source's own cap, so a value that
     hits its cap (e.g. 10/10) always reads as a full bar — matching the
     "10/10" text right next to it. Relative importance across sources
     (a cap of 30 mattering more than a cap of 10) is instead conveyed by
     the contribution number, not bar length. */
  document.getElementById('breakdown-stack').innerHTML = sourceDefs.map((s) => {
    const norm = Math.min(s.value, s.cap) / s.cap;
    const contribution = norm * s.weight;
    const atCap = s.value >= s.cap;
    return `
      <div class="mini-breakdown-row">
        <div class="mini-breakdown-top">
          <span class="label">${s.label}${atCap ? '<span class="row-detail-cap-flag" title="This source hit its scoring cap — real activity may be higher than what\'s shown">At cap</span>' : ''}</span>
          <span class="value">${s.value}<span class="row-detail-cap">/${s.cap}</span></span>
        </div>
        <div class="meter-track"><div class="meter-fill ${s.key}" style="width:${(norm * 100).toFixed(0)}%"></div></div>
        <span class="row-detail-contrib mini-breakdown-contrib">${contribution.toFixed(3)}</span>
      </div>
    `;
  }).join('');

  /* ── Momentum Trend chart (SVG) — real scan history now, not a
     synthetic illustrative curve. A company needs at least 2 real runs
     to draw a line; with just 1, there's nothing to chart yet, so we
     say so honestly instead of faking a trend. ── */
  function renderTrendChart() {
    const svgEl = document.getElementById('trend-svg');
    const captionEl = document.getElementById('trend-caption');
    const history = c.history || [];

    if (history.length < 2) {
      svgEl.innerHTML = '';
      captionEl.textContent = 'Not enough scan history yet — check back after the next run.';
      return;
    }

    const values = history.map((h) => h.index);
    const W = svgEl.getBoundingClientRect().width || 560, H = 140, PAD = 20, PAD_X = 24;
    svgEl.setAttribute('viewBox', `0 0 ${W} 160`);
    const min = Math.min(...values), max = Math.max(...values);
    const range = Math.max(max - min, 0.001);
    const usable = H - PAD * 2;
    const usableW = W - PAD_X * 2;
    const pts = values.map((v, i) => ({
      x: PAD_X + (i * usableW) / (values.length - 1),
      y: PAD + usable - ((v - min) / range) * usable,
    }));

    const areaCmds = `M ${pts[0].x.toFixed(1)} ${H} ` + pts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ` L ${pts[pts.length - 1].x.toFixed(1)} ${H} Z`;
    const lineCmds = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const dotsSvg = pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#ffffff" stroke="${THEME.trendAccent}" stroke-width="2" />`).join('');

    svgEl.innerHTML = `
      <path d="${areaCmds}" fill="${THEME.trendAccent}" opacity="0.14" />
      <path d="${lineCmds}" fill="none" stroke="${THEME.trendAccent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      ${dotsSvg}
    `;
    captionEl.textContent = `Tracks this company's opportunity index over time, across ${history.length} scans — every point is an actual pipeline run.`;
  }
  renderTrendChart();

  /* ── Peer Comparison ── */
  /* ── Rank Trend ──
     Momentum Trend already shows this company's own index moving over
     time; this shows something Momentum Trend can't: relative standing.
     A company can hold flat while everyone around it falls (rank
     improves) or rise while the field rises faster (rank falls) — the
     index line alone doesn't tell you which. Requires ranking this
     company against every other company at each of ITS OWN historical
     runs, not just the current scan. */
  function renderRankTrend() {
    const svgEl = document.getElementById('peer-compare-svg');
    const captionEl = document.getElementById('rank-trend-caption');

    // Every company's index at every run_id it has data for, grouped by
    // run_id, plus a run_id -> timestamp lookup so the shared axis below
    // is in chronological order regardless of any one company's own
    // (possibly shorter, possibly gappy) history.
    const byRun = {};
    const runTsById = {};
    companies.forEach((co) => {
      co.history.forEach((h) => {
        if (!byRun[h.run_id]) byRun[h.run_id] = [];
        byRun[h.run_id].push({ company_canonical: co.company_canonical, index: h.index });
        runTsById[h.run_id] = h.run_ts;
      });
    });
    const allRunIds = Object.keys(byRun).sort((a, b) => new Date(runTsById[a]) - new Date(runTsById[b]));

    // Rank of every company within its field, at every run_id.
    const rankByRun = {};
    allRunIds.forEach((runId) => {
      const field = byRun[runId].slice().sort((a, b) => b.index - a.index);
      const map = {};
      field.forEach((r, i) => { map[r.company_canonical] = { rank: i + 1, total: field.length }; });
      rankByRun[runId] = map;
    });

    const selfTrend = allRunIds
      .map((runId, i) => ({ i, entry: rankByRun[runId][c.company_canonical] }))
      .filter((t) => t.entry);

    const current = selfTrend[selfTrend.length - 1];
    document.getElementById('peer-rank-headline').innerHTML = `Ranks #<span class="num">${current.entry.rank}</span> of <span class="num">${current.entry.total}</span> tracked companies by opportunity index`;

    if (selfTrend.length < 2) {
      document.getElementById('peer-rank-sub').textContent = 'Not enough scan history yet to show a trend.';
      svgEl.innerHTML = '';
      captionEl.textContent = 'Check back after the next run.';
      return;
    }

    const earliest = selfTrend[0];
    const delta = earliest.entry.rank - current.entry.rank; // positive = climbed (rank number went down)
    const subText = delta > 0
      ? `Climbed <span class="num">${delta}</span> spot${delta === 1 ? '' : 's'} since the earliest tracked scan (was #${earliest.entry.rank}).`
      : delta < 0
        ? `Fell <span class="num">${Math.abs(delta)}</span> spot${Math.abs(delta) === 1 ? '' : 's'} since the earliest tracked scan (was #${earliest.entry.rank}).`
        : `Holding steady at this rank across the tracked scan history.`;
    document.getElementById('peer-rank-sub').innerHTML = subText;

    const W = svgEl.getBoundingClientRect().width || 560, H = 140, PAD = 16, PAD_X = 20;
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const maxTotal = Math.max(...allRunIds.map((id) => byRun[id].length));
    const usable = H - PAD * 2;
    const usableW = W - PAD_X * 2;
    const n = allRunIds.length;
    const xOf = (i) => PAD_X + (i * usableW) / Math.max(n - 1, 1);
    // Inverted on purpose: a better (lower/smaller) rank number should
    // read as higher on the chart, so "climbing" looks like climbing.
    const yOf = (rank) => PAD + ((rank - 1) / Math.max(maxTotal - 1, 1)) * usable;

    // Every other tracked company, as thin muted context lines behind the
    // highlighted subject — same "context first, subject on top" pattern
    // used for the muted dots in Signal Rank by Source.
    const peerLinesSvg = companies
      .filter((co) => co.company_canonical !== c.company_canonical)
      .map((co) => {
        const pts = allRunIds
          .map((runId, i) => {
            const entry = rankByRun[runId][co.company_canonical];
            return entry ? { x: xOf(i), y: yOf(entry.rank) } : null;
          })
          .filter(Boolean);
        if (pts.length < 2) return '';
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        return `<path d="${d}" fill="none" stroke="${THEME.mutedDot}" stroke-width="1" opacity="0.3"><title>${escapeXml(co.company)}</title></path>`;
      }).join('');

    const tierDotVar = cls === 'amber' ? '--amber-deep' : cls === 'rose' ? '--rose-deep' : '--green-deep';
    const selfPts = selfTrend.map((t) => ({ x: xOf(t.i), y: yOf(t.entry.rank) }));
    const selfLine = selfPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const selfDots = selfPts.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#ffffff" stroke="var(${tierDotVar})" stroke-width="2"><title>${escapeXml(c.company)}: #${selfTrend[i].entry.rank} of ${selfTrend[i].entry.total}</title></circle>`).join('');

    svgEl.innerHTML = `
      ${peerLinesSvg}
      <path d="${selfLine}" fill="none" stroke="var(${tierDotVar})" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${selfDots}
    `;

    captionEl.textContent = `This company's opportunity-index rank (highlighted) against every other tracked company (faint lines) across ${n} scans — relative standing versus the field, not just its own score. Hover a line or dot for detail.`;
  }
  renderRankTrend();

  /* ── Signal Rank by Source ──
     Framed by percentile, not raw rank — companies often tie at a source's
     cap (e.g. linkedin capped at 15), so "#1 of N" would overstate precision
     when several companies share that exact capped value. */
  function renderSourceRank() {
    const SOURCE_DEFS = [
      { key: 'news', label: 'News', field: 'news_signals', cls: 'source-news', colorVar: '--news-color' },
      { key: 'reddit', label: 'Reddit', field: 'reddit_signals', cls: 'source-reddit', colorVar: '--reddit-red' },
      { key: 'linkedin', label: 'LinkedIn', field: 'linkedin_signals', cls: 'source-linkedin', colorVar: '--linkedin-blue' },
      { key: 'github', label: 'GitHub', field: 'github_signals', cls: 'source-github', colorVar: '--github-color' },
      { key: 'hn', label: 'Hacker News', field: 'hn_signals', cls: 'source-hn', colorVar: '--hn-color' },
      { key: 'exec_hire', label: 'Executive Hires', field: 'exec_hire_signals', cls: 'source-exec_hire', colorVar: '--exec-hire-color' },
      { key: 'funding', label: 'Funding', field: 'funding_signals', cls: 'source-funding', colorVar: '--funding-color' },
      { key: 'patents', label: 'Patents', field: 'patent_signals', cls: 'source-patents', colorVar: '--patents-color' },
    ];

    const stats = SOURCE_DEFS.map((s) => {
      const values = companies.map((co) => co[s.field]);
      const selfValue = c[s.field];
      const lowerCount = values.filter((v) => v < selfValue).length;
      const percentile = companies.length > 1 ? Math.round((lowerCount / (companies.length - 1)) * 100) : 100;
      return { ...s, selfValue, min: Math.min(...values), max: Math.max(...values), percentile };
    });

    const strongest = stats.reduce((a, b) => (b.percentile > a.percentile ? b : a));
    const weakest = stats.reduce((a, b) => (b.percentile < a.percentile ? b : a));
    document.getElementById('source-rank-headline').innerHTML =
      `Strongest relative to peers: <strong>${strongest.label}</strong> (higher than <span class="num">${strongest.percentile}%</span>) — weakest: <strong>${weakest.label}</strong> (higher than only <span class="num">${weakest.percentile}%</span>).`;

    /* Weak and strong rows get the same tier-color vocabulary used for
       the overall tier badge (rose/green) instead of every row looking
       identical regardless of percentile — knowing where a company is
       unexceptional matters just as much as knowing where it's strong,
       for calibrating how much to trust the headline score. */
    document.getElementById('source-rank-rows').innerHTML = stats.map((s) => {
      const tier = s.percentile < 25 ? 'weak' : s.percentile >= 75 ? 'strong' : '';
      return `
      <div class="source-rank-row">
        <span class="source-pill ${s.cls} source-rank-row-label">${s.label}</span>
        <svg class="source-rank-row-strip" data-source="${s.key}" height="20" aria-hidden="true"></svg>
        <span class="source-rank-row-pct${tier ? ' source-rank-row-pct-' + tier : ''}">Higher than <span class="num">${s.percentile}%</span></span>
      </div>
    `;
    }).join('');

    stats.forEach((s) => {
      const svgEl = document.querySelector(`.source-rank-row-strip[data-source="${s.key}"]`);
      const W = svgEl.getBoundingClientRect().width || 200, H = 20, PAD_X = 8;
      svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const range = Math.max(s.max - s.min, 0.001);
      const usableW = W - PAD_X * 2;
      const xOf = (v) => PAD_X + ((v - s.min) / range) * usableW;
      const cy = H / 2;

      /* Muted dots first, highlighted dot drawn last (on top) — otherwise
         a tie with another company at the exact same value paints over
         the highlight, since several companies often share a capped max.
         Dots are semi-transparent rather than solid: with 20+ tracked
         companies, many genuinely tie on the same raw count (especially
         at a source's cap), so solid same-color circles at the same
         position just blend into one shape -- reading as a missing dot,
         or as a stretched oval where two near-but-not-quite-identical
         values overlap. Translucency turns a tied cluster into a
         visibly darker blob instead, and each dot's <title> exposes the
         real company name + value on hover for hover for identification. */
      const mutedDotsSvg = companies
        .filter((co) => co.company !== c.company)
        .map((co) => `<circle cx="${xOf(co[s.field]).toFixed(1)}" cy="${cy}" r="3" fill="${THEME.mutedDot}" opacity="0.55"><title>${escapeXml(co.company)}: ${co[s.field]}</title></circle>`)
        .join('');
      const highlightSvg = `<circle cx="${xOf(c[s.field]).toFixed(1)}" cy="${cy}" r="4.5" fill="var(${s.colorVar})" stroke="#ffffff" stroke-width="1.5"><title>${escapeXml(c.company)}: ${c[s.field]} (this company)</title></circle>`;

      svgEl.innerHTML = `
        <line x1="${PAD_X}" y1="${cy}" x2="${W - PAD_X}" y2="${cy}" stroke="${THEME.border}" stroke-width="1" />
        ${mutedDotsSvg}
        ${highlightSvg}
      `;
    });
  }
  renderSourceRank();

  /* ── Signal Radar (8-axis polar chart) — same per-source data as Signal
     Breakdown, encoded as shape instead of bars so a company's signal
     profile (GitHub-heavy vs funding-heavy vs balanced) reads at a
     glance. Axes are normalized to value/cap, the same norm used for
     contribution math elsewhere, so all 8 axes are comparable despite
     having different caps.

     Also supports overlaying up to 2 other companies' shapes for direct
     comparison — picked via the two <select> elements above the chart.
     The main company keeps its original treatment untouched (accent
     fill/stroke, per-source rainbow dots) regardless of whether anyone
     is being compared; overlay companies get a single flat color each
     (dashed outline, matching solid dots) so their shape doesn't fight
     the main company's per-source dot coloring for meaning. ── */
  const compareCompanies = [null, null]; // company_canonical per select, or null
  const COMPARE_COLOR_VARS = ['--hue-purple', '--hue-teal'];

  function populateCompareSelects() {
    const others = companies
      .filter((co) => co.company_canonical !== c.company_canonical)
      .slice()
      .sort((a, b) => a.company.localeCompare(b.company));

    [0, 1].forEach((idx) => {
      const sel = document.getElementById(`radar-compare-${idx + 1}`);
      if (!sel) return;
      const otherPick = compareCompanies[1 - idx];
      const optionsHtml = others
        .filter((co) => co.company_canonical !== otherPick)
        .map((co) => `<option value="${co.company_canonical}">${escapeXml(co.company)}</option>`)
        .join('');
      sel.innerHTML = `<option value="">+ Compare with…</option>${optionsHtml}`;
      sel.value = compareCompanies[idx] || '';
    });
  }

  function renderSignalRadar() {
    const svgEl = document.getElementById('signal-radar-svg');
    const captionEl = document.getElementById('signal-radar-caption');
    const legendEl = document.getElementById('radar-legend');

    const SOURCE_DEFS = [
      { key: 'news_signals', label: 'News', cap: CAPS.news, colorVar: '--news-color' },
      { key: 'reddit_signals', label: 'Reddit', cap: CAPS.reddit, colorVar: '--reddit-red' },
      { key: 'linkedin_signals', label: 'LinkedIn', cap: CAPS.linkedin, colorVar: '--linkedin-blue' },
      { key: 'github_signals', label: 'GitHub', cap: CAPS.github, colorVar: '--github-color' },
      { key: 'hn_signals', label: 'HN', cap: CAPS.hn, colorVar: '--hn-color' },
      { key: 'exec_hire_signals', label: 'Exec Hires', cap: CAPS.exec_hire, colorVar: '--exec-hire-color' },
      { key: 'funding_signals', label: 'Funding', cap: CAPS.funding, colorVar: '--funding-color' },
      { key: 'patent_signals', label: 'Patents', cap: CAPS.patents, colorVar: '--patents-color' },
    ];

    const compareSeries = compareCompanies
      .map((canon, i) => {
        if (!canon) return null;
        const co = companies.find((x) => x.company_canonical === canon);
        return co ? { company: co, colorVar: COMPARE_COLOR_VARS[i] } : null;
      })
      .filter(Boolean);

    // Read the actual rendered width rather than hardcoding it — a fixed
    // viewBox width that doesn't match the real card width leaves the
    // chart letterboxed (empty space top/bottom) instead of filling the
    // card, since the browser scales the SVG to fit while preserving
    // its (wrong) aspect ratio.
    const W = svgEl.getBoundingClientRect().width || 350, H = 270;
    const cx = W / 2, cy = 140;
    const maxR = Math.min(cx - 68, cy - 13, H - cy - 13);
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const n = SOURCE_DEFS.length;
    const angleFor = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pointAt = (i, r) => ({
      x: cx + r * Math.cos(angleFor(i)),
      y: cy + r * Math.sin(angleFor(i)),
    });
    const pointsFor = (co) => SOURCE_DEFS.map((s, i) => {
      const norm = Math.min(co[s.key], s.cap) / s.cap;
      return pointAt(i, maxR * norm);
    });
    const pathFor = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Grid rings at 25/50/75/100% of max radius.
    const ringsSvg = [0.25, 0.5, 0.75, 1].map((frac) => {
      const pts = SOURCE_DEFS.map((_, i) => pointAt(i, maxR * frac));
      return `<polygon points="${pathFor(pts)}" fill="none" stroke="var(--border)" stroke-width="1" />`;
    }).join('');

    // Spokes from center out to each axis's max-radius vertex.
    const spokesSvg = SOURCE_DEFS.map((_, i) => {
      const p = pointAt(i, maxR);
      return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="var(--border)" stroke-width="1" />`;
    }).join('');

    // Main company — unchanged from the single-company treatment:
    // tinted fill, solid accent stroke, per-source rainbow dots.
    const selfPoints = pointsFor(c);
    const selfDotsSvg = SOURCE_DEFS.map((s, i) => {
      const p = selfPoints[i];
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(${s.colorVar})" stroke="#ffffff" stroke-width="1.5"><title>${escapeXml(c.company)} — ${escapeXml(s.label)}: ${c[s.key]}/${s.cap}</title></circle>`;
    }).join('');

    // Compare overlays — flat single color per company (dashed outline +
    // matching solid dots), deliberately not sharing the source-rainbow
    // language so it's clear these are a different kind of series.
    const compareSvg = compareSeries.map((ser) => {
      const pts = pointsFor(ser.company);
      const dotsSvg = SOURCE_DEFS.map((s, i) => {
        const p = pts[i];
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="var(${ser.colorVar})" stroke="#ffffff" stroke-width="1.5"><title>${escapeXml(ser.company.company)} — ${escapeXml(s.label)}: ${ser.company[s.key]}/${s.cap}</title></circle>`;
      }).join('');
      return `
        <polygon points="${pathFor(pts)}" fill="none" stroke="var(${ser.colorVar})" stroke-width="2" stroke-linejoin="round" stroke-dasharray="4 3" />
        ${dotsSvg}
      `;
    }).join('');

    // Axis labels, anchor flips based on which side of the chart they fall on
    // so text grows away from the shape instead of into it.
    const labelsSvg = SOURCE_DEFS.map((s, i) => {
      const p = pointAt(i, maxR + 13);
      const cosV = Math.cos(angleFor(i));
      let anchor = 'middle';
      if (cosV > 0.3) anchor = 'start';
      else if (cosV < -0.3) anchor = 'end';
      return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" font-family="Inter, sans-serif" font-weight="700" fill="var(--text-secondary)">${escapeXml(s.label)}</text>`;
    }).join('');

    svgEl.innerHTML = `
      ${ringsSvg}
      ${spokesSvg}
      <polygon points="${pathFor(selfPoints)}" fill="var(--accent)" opacity="0.16" />
      <polygon points="${pathFor(selfPoints)}" fill="none" stroke="var(--accent-deep)" stroke-width="2" stroke-linejoin="round" />
      ${selfDotsSvg}
      ${compareSvg}
      ${labelsSvg}
    `;

    if (legendEl) {
      if (compareSeries.length === 0) {
        legendEl.innerHTML = '';
      } else {
        const selfItem = `<span class="radar-legend-item"><span class="radar-legend-swatch" style="background:var(--accent-deep)"></span>${escapeXml(c.company)}</span>`;
        const compareItems = compareSeries.map((ser) => `<span class="radar-legend-item"><span class="radar-legend-swatch" style="background:var(${ser.colorVar})"></span>${escapeXml(ser.company.company)}</span>`).join('');
        legendEl.innerHTML = selfItem + compareItems;
      }
    }

    const atCapCount = SOURCE_DEFS.filter((s) => c[s.key] >= s.cap).length;
    captionEl.textContent = atCapCount > 0
      ? `Each axis is one of the 8 tracked signal sources — shape is this company's profile across all of them, and points on the outer ring are at or near that source's scoring cap (${atCapCount} of ${n} here).`
      : `Each axis is one of the 8 tracked signal sources — shape is this company's profile across all of them, distance from center relative to each source's scoring cap.`;
  }

  populateCompareSelects();
  [0, 1].forEach((idx) => {
    const sel = document.getElementById(`radar-compare-${idx + 1}`);
    if (!sel) return;
    sel.addEventListener('change', () => {
      compareCompanies[idx] = sel.value || null;
      populateCompareSelects();
      renderSignalRadar();
    });
  });
  renderSignalRadar();

  /* ── Recommended Next Steps ── */
  const NEXT_STEPS = [
    { id: 'watchlist', label: 'Add to Watchlist', doneLabel: 'Added to Watchlist' },
    { id: 'reminder', label: 'Set Re-scan Reminder', doneLabel: 'Reminder Set' },
    { id: 'flag', label: 'Flag for Outreach Review', doneLabel: 'Flagged for Review' },
  ];
  const nextStepsEl = document.getElementById('next-steps-list');
  nextStepsEl.innerHTML = NEXT_STEPS.map((s) => `
    <button class="next-step-row" type="button" data-step="${s.id}">
      <span class="next-step-check" aria-hidden="true"></span>
      <span class="next-step-label">${s.label}</span>
    </button>
  `).join('');
  nextStepsEl.querySelectorAll('.next-step-row').forEach((row) => {
    const step = NEXT_STEPS.find((s) => s.id === row.dataset.step);
    row.addEventListener('click', () => {
      const isDone = row.classList.toggle('done');
      row.querySelector('.next-step-label').textContent = isDone ? step.doneLabel : step.label;
    });
  });

  /* ── Why This Matters ── */
  document.getElementById('detail-why-text').innerHTML = generateWhyItMatters(c);

  /* ── Suggested Contact ── */
  populateContactCard(c);
}

/* ── Init: wait for live data before rendering. ── */
const detailLoadingOverlayEl = document.getElementById('loading-overlay');
const detailFallbackBannerEl = document.getElementById('fallback-banner');

Promise.all([loadCompanyData(), loadContactsData()]).then(() => {
  initDetailPage();
  if (detailLoadingOverlayEl) detailLoadingOverlayEl.hidden = true;
  if (detailFallbackBannerEl) detailFallbackBannerEl.hidden = dataSource !== 'fallback';
});
