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
  indexEl.style.color = cls === 'amber' ? 'var(--amber-deep)' : cls === 'rose' ? 'var(--rose-deep)' : 'var(--accent-deep)';

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
  /* Bar width is scaled against the highest cap among these sources
     (not each source's own cap) — otherwise a value of 10 at its cap of
     10 and a value of 30 at its cap of 30 would render as the same
     100%-width bar, even though 30 is three times as many mentions. */
  const maxCap = Math.max(...sourceDefs.map((s) => s.cap));
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
        <div class="meter-track"><div class="meter-fill ${s.key}" style="width:${Math.min(100, (s.value / maxCap) * 100).toFixed(0)}%"></div></div>
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
    captionEl.textContent = `Real signal history across ${history.length} scans — every point is an actual pipeline run.`;
  }
  renderTrendChart();

  /* ── Peer Comparison ── */
  function renderPeerComparison() {
    const svgEl = document.getElementById('peer-compare-svg');
    const W = svgEl.getBoundingClientRect().width || 560, H = 56, PAD_X = 16;
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const values = companies.map((co) => co.opportunity_index_precise);
    const min = Math.min(...values), max = Math.max(...values);
    const range = Math.max(max - min, 0.001);
    const usableW = W - PAD_X * 2;
    const xOf = (v) => PAD_X + ((v - min) / range) * usableW;
    const cy = H / 2;

    const ranked = companies.slice().sort((a, b) => b.opportunity_index_precise - a.opportunity_index_precise);
    const rank = ranked.findIndex((co) => co.company === c.company) + 1;
    const lowerCount = companies.filter((co) => co.opportunity_index_precise < c.opportunity_index_precise).length;
    const percentile = companies.length > 1 ? Math.round((lowerCount / (companies.length - 1)) * 100) : 100;

    document.getElementById('peer-rank-headline').innerHTML = `Ranks #<span class="num">${rank}</span> of <span class="num">${companies.length}</span> tracked companies`;
    document.getElementById('peer-rank-sub').innerHTML = `Higher signal than <span class="num">${percentile}%</span> of other tracked companies this scan.`;

    /* Highlighted dot uses this company's own tier color rather than a
       generic accent — a small, purposeful splash of color instead of
       decoration for decoration's sake. Drawn in its own pass, after all
       muted dots, so it isn't painted over when other companies tie on
       the exact same value (a real possibility — several often share a
       capped max). */
    const tierDotVar = cls === 'amber' ? '--amber-deep' : cls === 'rose' ? '--rose-deep' : '--green-deep';
    const mutedDotsSvg = companies
      .filter((co) => co.company !== c.company)
      .map((co) => {
        const cx = xOf(co.opportunity_index_precise).toFixed(1);
        return `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${THEME.mutedDot}" stroke="#ffffff" stroke-width="1" />`;
      }).join('');
    const selfCx = xOf(c.opportunity_index_precise).toFixed(1);
    const highlightSvg = `
      <circle cx="${selfCx}" cy="${cy}" r="8" fill="none" stroke="var(${tierDotVar})" stroke-width="1.5" stroke-dasharray="2 2" />
      <circle cx="${selfCx}" cy="${cy}" r="5" fill="var(${tierDotVar})" />
    `;

    svgEl.innerHTML = `
      <line x1="${PAD_X}" y1="${cy}" x2="${W - PAD_X}" y2="${cy}" stroke="${THEME.border}" stroke-width="1" />
      ${mutedDotsSvg}
      ${highlightSvg}
    `;
  }
  renderPeerComparison();

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
    document.getElementById('source-rank-headline').innerHTML =
      `Strongest relative to peers: <strong>${strongest.label}</strong> — higher than <span class="num">${strongest.percentile}%</span> of tracked companies.`;

    document.getElementById('source-rank-rows').innerHTML = stats.map((s) => `
      <div class="source-rank-row">
        <span class="source-pill ${s.cls} source-rank-row-label">${s.label}</span>
        <svg class="source-rank-row-strip" data-source="${s.key}" height="20" aria-hidden="true"></svg>
        <span class="source-rank-row-pct">Higher than <span class="num">${s.percentile}%</span></span>
      </div>
    `).join('');

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
     having different caps. ── */
  function renderSignalRadar() {
    const svgEl = document.getElementById('signal-radar-svg');
    const captionEl = document.getElementById('signal-radar-caption');

    const RADAR_DEFS = [
      { label: 'News', value: c.news_signals, cap: CAPS.news, colorVar: '--news-color' },
      { label: 'Reddit', value: c.reddit_signals, cap: CAPS.reddit, colorVar: '--reddit-red' },
      { label: 'LinkedIn', value: c.linkedin_signals, cap: CAPS.linkedin, colorVar: '--linkedin-blue' },
      { label: 'GitHub', value: c.github_signals, cap: CAPS.github, colorVar: '--github-color' },
      { label: 'HN', value: c.hn_signals, cap: CAPS.hn, colorVar: '--hn-color' },
      { label: 'Exec Hires', value: c.exec_hire_signals, cap: CAPS.exec_hire, colorVar: '--exec-hire-color' },
      { label: 'Funding', value: c.funding_signals, cap: CAPS.funding, colorVar: '--funding-color' },
      { label: 'Patents', value: c.patent_signals, cap: CAPS.patents, colorVar: '--patents-color' },
    ];

    const W = 350, H = 270;
    const cx = W / 2, cy = 140, maxR = 95;
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const n = RADAR_DEFS.length;
    const angleFor = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const pointAt = (i, r) => ({
      x: cx + r * Math.cos(angleFor(i)),
      y: cy + r * Math.sin(angleFor(i)),
    });

    // Grid rings at 25/50/75/100% of max radius.
    const ringsSvg = [0.25, 0.5, 0.75, 1].map((frac) => {
      const pts = RADAR_DEFS.map((_, i) => pointAt(i, maxR * frac));
      const d = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      return `<polygon points="${d}" fill="none" stroke="var(--border)" stroke-width="1" />`;
    }).join('');

    // Spokes from center out to each axis's max-radius vertex.
    const spokesSvg = RADAR_DEFS.map((_, i) => {
      const p = pointAt(i, maxR);
      return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="var(--border)" stroke-width="1" />`;
    }).join('');

    // Data polygon — one vertex per source, radius = value/cap (clamped to 1).
    const dataPoints = RADAR_DEFS.map((s, i) => {
      const norm = Math.min(s.value, s.cap) / s.cap;
      return pointAt(i, maxR * norm);
    });
    const dataPath = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Vertex dots, colored per source (matches the dot treatment used in
    // Signal Rank by Source), with a tooltip showing the raw value.
    const dotsSvg = RADAR_DEFS.map((s, i) => {
      const p = dataPoints[i];
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(${s.colorVar})" stroke="#ffffff" stroke-width="1.5"><title>${escapeXml(s.label)}: ${s.value}/${s.cap}</title></circle>`;
    }).join('');

    // Axis labels, anchor flips based on which side of the chart they fall on
    // so text grows away from the shape instead of into it.
    const labelsSvg = RADAR_DEFS.map((s, i) => {
      const p = pointAt(i, maxR + 13);
      const cos = Math.cos(angleFor(i));
      let anchor = 'middle';
      if (cos > 0.3) anchor = 'start';
      else if (cos < -0.3) anchor = 'end';
      return `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" font-family="Inter, sans-serif" font-weight="700" fill="var(--text-secondary)">${escapeXml(s.label)}</text>`;
    }).join('');

    svgEl.innerHTML = `
      ${ringsSvg}
      ${spokesSvg}
      <polygon points="${dataPath}" fill="var(--accent)" opacity="0.16" />
      <polygon points="${dataPath}" fill="none" stroke="var(--accent-deep)" stroke-width="2" stroke-linejoin="round" />
      ${dotsSvg}
      ${labelsSvg}
    `;

    const atCapCount = RADAR_DEFS.filter((s) => s.value >= s.cap).length;
    captionEl.textContent = atCapCount > 0
      ? `Shape shows this company's signal profile — points on the outer ring are at or near their scoring cap (${atCapCount} of ${n} here).`
      : `Shape shows this company's signal profile relative to each source's scoring cap.`;
  }
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

  /* ── Suggested Contact ──
     Capped — some discovered "company" names are actually whole clauses
     the discovery LLM extracted (e.g. "Unspecified AI startup by former
     Target executive"), and an uncapped handle turns those into an
     absurdly long, unrealistic-looking email domain. */
  const emailHandle = c.company.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  document.getElementById('detail-contact-title').textContent = `Engineering Recruiter · ${c.company}`;
  document.getElementById('detail-contact-email').textContent = `jordan.reyes@${emailHandle}.com`;
}

/* ── Init: wait for live data before rendering. ── */
const detailLoadingOverlayEl = document.getElementById('loading-overlay');
const detailFallbackBannerEl = document.getElementById('fallback-banner');

loadCompanyData().then(() => {
  initDetailPage();
  if (detailLoadingOverlayEl) detailLoadingOverlayEl.hidden = true;
  if (detailFallbackBannerEl) detailFallbackBannerEl.hidden = dataSource !== 'fallback';
});
