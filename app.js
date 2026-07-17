/*
 * Dashboard page logic. Company data, scoring formula, and shared helpers
 * live in data.js (loaded before this file).
 */

/* ── DOM refs ── */
const searchInput = document.getElementById('search-input');
const sortToggle = document.getElementById('sort-toggle');
const groupToggle = document.getElementById('group-toggle');
const stealthToggle = document.getElementById('stealth-toggle');
const clearButton = document.getElementById('clear-filters');
const rankedListEl = document.getElementById('ranked-list');
const listEmptyEl = document.getElementById('list-empty');
const companiesTrackedCountEl = document.getElementById('companies-tracked-count');
const quadrantSvg = document.getElementById('quadrant-svg');

let sortDirection = 'desc';
let groupByTier = true;
let stealthFilterOn = false;
let selectedCompany = null;
let expandedCompany = null; // which row's per-source detail is toggled open (click, not hover)

/* ── Stealth Hiring ──
   Same criteria as the Job Value Quadrant's bottom-right cell (funding +
   exec hires above the field median, LinkedIn below it) — companies
   showing real growth/leadership signal with no public job posting yet.
   Computed once per render against the FULL company set (not the
   search-filtered subset) so percentile rank stays meaningful regardless
   of what's currently typed in the search box. */
function computeStealthCandidates(allCompanies) {
  const xRanks = percentileRanks(allCompanies.map((c) => c.funding_signals + c.exec_hire_signals));
  const yRanks = percentileRanks(allCompanies.map((c) => c.linkedin_signals));
  const set = new Set();
  allCompanies.forEach((c, i) => {
    if (xRanks[i] > 0.5 && yRanks[i] < 0.5) set.add(c.company);
  });
  return set;
}

/* ── Job Value Quadrant (SVG) ──
   Two axes chosen for the outreach decision specifically, not overall
   momentum: X = funding + executive hires (capacity/intent to grow),
   Y = LinkedIn activity — the one signal in SOURCE_TIMING actually
   tagged 'confirming' rather than 'leading', i.e. roles already
   posted. Bottom-right (funded/hiring leadership, nothing posted yet)
   is the highest-value outreach window: real growth signal before
   the crowd sees an open role. No persistent labels — company count
   makes those collide immediately, so identity is hover-only (title
   tooltip), matching the pattern used for Rank Trend's peer lines and
   Signal Rank by Source's scatter dots. */
/* Signal counts are capped and integer-valued, so most companies sit at
   exactly 0 or exactly the cap — a raw-value axis piles everyone onto the
   two edges with a dead zone in between, no matter how the chart is
   drawn. Percentile rank fixes this at the source: position encodes
   relative standing, not magnitude, so the field spreads across the full
   plot by construction. Ties still separate too, since stable sort gives
   each tied company its own consecutive rank slot instead of identical
   positions. */
function percentileRanks(vals) {
  const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
  const ranks = new Array(vals.length);
  order.forEach((originalIdx, pos) => {
    ranks[originalIdx] = vals.length > 1 ? pos / (vals.length - 1) : 0.5;
  });
  return ranks;
}

function tierColorVar(tier) {
  const tc = tierClass(tier);
  return tc === 'amber' ? '--amber-deep' : tc === 'rose' ? '--rose-deep' : '--green-deep';
}

/* Signals are capped, integer-valued counts, so exact ties are common —
   several companies routinely land on the identical pixel (e.g. everyone
   maxed out on both axes). Deterministic (name-seeded, not random) jitter
   keeps every dot individually hoverable/clickable instead of only the
   topmost one in a stack, without the layout shifting between renders. */
function hashJitter(str, spread) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  const dx = (((h & 0xff) / 255) - 0.5) * 2 * spread;
  const dy = ((((h >> 8) & 0xff) / 255) - 0.5) * 2 * spread;
  return { dx, dy };
}

function renderQuadrant() {
  // Read the actual rendered width rather than hardcoding it — viewBox
  // units only equal real screen pixels when this matches the real box
  // size. It didn't (this was fixed at 400 while the box is ~350), so
  // every "move this label N px" request was silently off by a ~0.875
  // scale factor the whole time. H = W since .quadrant-scope is a
  // guaranteed square (aspect-ratio: 1/1 + flex-shrink: 0).
  const W = quadrantSvg.getBoundingClientRect().width || 400;
  const H = W;
  const PAD = 46;
  const plotW = W - PAD * 2, plotH = H - PAD * 2;
  // The HTML hardcodes viewBox="0 0 400 400" and nothing ever updated it
  // dynamically — had to be set here too, or coordinates computed for
  // the real ~350 box would be drawn into a viewBox still claiming 400.
  quadrantSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const xRanks = percentileRanks(companies.map((c) => c.funding_signals + c.exec_hire_signals));
  const yRanks = percentileRanks(companies.map((c) => c.linkedin_signals));

  const xOf = (rank) => PAD + rank * plotW;
  const yOf = (rank) => PAD + plotH - rank * plotH;

  const mutedLine = hexToRgba(THEME.accent, 0.25);
  const labelAttrs = `font-size="10" font-weight="700" font-family="Inter, sans-serif" fill="var(--text-secondary)"`;
  let svg = '';

  // Quadrant divider lines sit at the 50th percentile by construction —
  // half the field above, half below, on each axis.
  svg += `<line x1="${PAD}" y1="${yOf(0.5).toFixed(1)}" x2="${W - PAD}" y2="${yOf(0.5).toFixed(1)}" stroke="${mutedLine}" stroke-width="1" stroke-dasharray="3 3" />`;
  svg += `<line x1="${xOf(0.5).toFixed(1)}" y1="${PAD}" x2="${xOf(0.5).toFixed(1)}" y2="${H - PAD}" stroke="${mutedLine}" stroke-width="1" stroke-dasharray="3 3" />`;

  svg += `<text x="${W - PAD}" y="${PAD - 10}" text-anchor="end" ${labelAttrs}>FUNDED &amp; HIRING</text>`;
  svg += `<text x="${PAD}" y="${PAD - 10}" text-anchor="start" ${labelAttrs}>ROLES POSTED, LOW GROWTH</text>`;
  svg += `<text x="${W - PAD}" y="${H - PAD + 20}" text-anchor="end" ${labelAttrs}>EARLY — NOT POSTED YET</text>`;
  svg += `<text x="${PAD}" y="${H - PAD + 20}" text-anchor="start" ${labelAttrs}>LOW ACTIVITY</text>`;

  svg += `<text x="${W / 2}" y="${H - 20}" text-anchor="middle" ${labelAttrs}>FUNDING + EXEC HIRES →</text>`;
  svg += `<text x="23" y="${H / 2}" text-anchor="middle" ${labelAttrs} transform="rotate(-90 23 ${H / 2})">LINKEDIN ACTIVITY →</text>`;

  companies.forEach((c, i) => {
    const { dx, dy } = hashJitter(c.company, 4);
    const cx = Math.min(W - PAD, Math.max(PAD, xOf(xRanks[i]) + dx));
    const cy = Math.min(H - PAD, Math.max(PAD, yOf(yRanks[i]) + dy));
    const isSelected = c.company === selectedCompany.company;
    const colorVar = tierColorVar(c.tier);

    if (isSelected) {
      svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="none" stroke="${THEME.dark}" stroke-width="1.5" stroke-dasharray="3 2" />`;
    }
    svg += `<circle class="quadrant-dot" data-company="${c.company}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="var(${colorVar})" opacity="0.7" stroke="#ffffff" stroke-width="1" style="cursor:pointer"><title>${escapeXml(c.company)}: ${c.funding_signals + c.exec_hire_signals} funding/exec hires, ${c.linkedin_signals} LinkedIn</title></circle>`;
  });

  quadrantSvg.innerHTML = svg;
  quadrantSvg.querySelectorAll('[data-company]').forEach((el) => {
    el.addEventListener('click', () => selectCompany(el.getAttribute('data-company')));
  });
}

/* ── Change-since-last-scan badge: delta between the two most recent real
   runs in c.history. Omitted entirely for companies with fewer than 2
   runs recorded — there's nothing to compare yet (the "New Discovery"
   badge already covers that case). Deliberately just a colored arrow +
   number, no sparkline — an earlier attempt at a full per-row sparkline
   (see git history) was reverted as too much visual noise for this list. */
function renderMomentumBadge(c) {
  const h = c.history || [];
  if (h.length < 2) return '';

  const delta = h[h.length - 1].index - h[h.length - 2].index;
  const dir = delta > 0.005 ? 'up' : delta < -0.005 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●';
  const label = dir === 'flat' ? 'Flat' : `<span class="num">${delta > 0 ? '+' : ''}${delta.toFixed(2)}</span>`;

  return `<span class="momentum-delta momentum-${dir}" title="Change since previous scan">${arrow} ${label}</span>`;
}

/* ── Ranked list ── */
function renderList() {
  const stealthCandidates = computeStealthCandidates(companies);
  const query = searchInput.value.trim().toLowerCase();
  const filtered = companies
    .filter((c) => !query || c.company.toLowerCase().includes(query))
    .filter((c) => !stealthFilterOn || stealthCandidates.has(c.company));
  const sorted = filtered.slice().sort((a, b) =>
    sortDirection === 'desc' ? b.opportunity_index_precise - a.opportunity_index_precise : a.opportunity_index_precise - b.opportunity_index_precise
  );

  rankedListEl.innerHTML = '';
  listEmptyEl.hidden = sorted.length !== 0;
  companiesTrackedCountEl.innerHTML = `<span class="num">${companies.length}</span> companies tracked`;

  function renderRow(c) {
    const cls = tierClass(c.tier);
    const row = document.createElement('div');
    row.className = 'company-row'
      + (c.company === selectedCompany.company ? ' selected' : '')
      + (c.company === expandedCompany ? ' expanded' : '');
    row.dataset.company = c.company;

    const discoveryBadge = c.discovery_source === 'discovered'
      ? `<span class="discovery-badge" title="Newly discovered this scan — not on the existing tracked list">New Discovery</span>`
      : '';
    const stealthBadge = stealthCandidates.has(c.company)
      ? `<span class="stealth-badge" title="Strong funding/exec-hire signal with little-to-no LinkedIn activity — likely growing before any role is publicly posted">Stealth Hire</span>`
      : '';

    const sourceDefs = [
      { label: 'News', cls: 'source-news', value: c.news_signals, cap: CAPS.news, weight: WEIGHTS.news },
      { label: 'Reddit', cls: 'source-reddit', value: c.reddit_signals, cap: CAPS.reddit, weight: WEIGHTS.reddit },
      { label: 'LinkedIn', cls: 'source-linkedin', value: c.linkedin_signals, cap: CAPS.linkedin, weight: WEIGHTS.linkedin },
      { label: 'GitHub', cls: 'source-github', value: c.github_signals, cap: CAPS.github, weight: WEIGHTS.github },
      { label: 'Hacker News', cls: 'source-hn', value: c.hn_signals, cap: CAPS.hn, weight: WEIGHTS.hn },
      { label: 'Executive Hires', cls: 'source-exec_hire', value: c.exec_hire_signals, cap: CAPS.exec_hire, weight: WEIGHTS.exec_hire },
      { label: 'Funding', cls: 'source-funding', value: c.funding_signals, cap: CAPS.funding, weight: WEIGHTS.funding },
      { label: 'Patents', cls: 'source-patents', value: c.patent_signals, cap: CAPS.patents, weight: WEIGHTS.patents },
    ];
    /* Bar width scaled against the highest cap among these sources (not
       each source's own cap) — matches the Signal Breakdown widget on the
       detail page so the same per-source data reads the same way on both
       pages. */
    const maxCap = Math.max(...sourceDefs.map((s) => s.cap));
    const detailHtml = sourceDefs.map((s) => {
      const norm = Math.min(s.value, s.cap) / s.cap;
      const contribution = norm * s.weight;
      const atCap = s.value >= s.cap;
      return `
        <div class="row-detail-item">
          <span class="row-detail-label ${s.cls}">${s.label}${atCap ? '<span class="row-detail-cap-flag" title="This source hit its scoring cap — real activity may be higher than what\'s shown">At cap</span>' : ''}</span>
          <span class="row-detail-value">${s.value}<span class="row-detail-cap">/${s.cap}</span> <span class="row-detail-contrib">${contribution.toFixed(3)}</span></span>
          <div class="meter-track row-detail-meter"><div class="meter-fill ${s.cls}" style="width:${Math.min(100, (s.value / maxCap) * 100).toFixed(0)}%"></div></div>
        </div>
      `;
    }).join('');

    row.innerHTML = `
      <div class="company-row-top">
        <div class="company-row-name-group">
          <a class="company-row-name" href="detail.html?company=${encodeURIComponent(c.company)}">${escapeXml(c.company)}</a>
          ${discoveryBadge}
          ${stealthBadge}
        </div>
        <div class="company-row-right">
          ${renderMomentumBadge(c)}
          <span class="company-row-index ${cls}">${c.opportunity_index.toFixed(2)}</span>
        </div>
      </div>
      <p class="company-row-blurb">${escapeXml(getCompanyBlurb(c))}</p>
      <div class="company-row-detail"><div class="company-row-detail-inner">${detailHtml}</div></div>
    `;
    row.addEventListener('click', () => {
      expandedCompany = expandedCompany === c.company ? null : c.company;
      selectCompany(c.company);
    });
    row.querySelector('.company-row-name').addEventListener('click', (e) => e.stopPropagation());
    return row;
  }

  if (!groupByTier) {
    sorted.forEach((c) => rankedListEl.appendChild(renderRow(c)));
    return;
  }

  const groupOrder = ['Very Strong', 'Strong', 'Moderate', 'Weak', 'Very Weak'];
  groupOrder.forEach((tierName) => {
    const members = sorted.filter((c) => c.tier === tierName);
    if (members.length === 0) return;
    const cls = tierClass(tierName);

    const group = document.createElement('div');
    group.className = 'tier-group';
    const header = document.createElement('div');
    header.className = 'tier-group-header';
    header.innerHTML = `<span class="tier-group-dot ${cls}"></span><span class="tier-group-label ${cls}">${tierName.toUpperCase()} — <span class="num">${members.length}</span></span>`;
    group.appendChild(header);
    members.forEach((c) => group.appendChild(renderRow(c)));
    rankedListEl.appendChild(group);
  });
}

/* ── Job Opportunity Signals: radial gauge ── */
function renderRolesGauge(value, max) {
  const gaugeSvg = document.getElementById('roles-gauge');
  const size = 100, stroke = 10, r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  const dash = circumference * pct;

  gaugeSvg.innerHTML = `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${THEME.border}" stroke-width="${stroke}" />
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${THEME.accent}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}" />
  `;
}

/* ── Momentum Trend (miniature): same real-history logic as the detail
   page's full trend chart, just sized for the right rail. Needs at least
   2 real runs to draw a line — with just 1, there's nothing to chart yet. */
function renderInspectorTrend(c) {
  const svgEl = document.getElementById('inspector-trend-svg');
  const captionEl = document.getElementById('inspector-trend-caption');
  const history = c.history || [];

  if (history.length < 2) {
    svgEl.innerHTML = '';
    captionEl.textContent = 'Not enough scan history yet — check back after the next run.';
    return;
  }

  const values = history.map((h) => h.index);
  const W = svgEl.getBoundingClientRect().width || 260, H = svgEl.getBoundingClientRect().height || 120, PAD = 4, PAD_X = 4;
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('preserveAspectRatio', 'none');
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
  const last = pts[pts.length - 1];

  svgEl.innerHTML = `
    <path d="${areaCmds}" fill="${THEME.trendAccent}" opacity="0.14" />
    <path d="${lineCmds}" fill="none" stroke="${THEME.trendAccent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.5" fill="#ffffff" stroke="${THEME.trendAccent}" stroke-width="1.5" />
  `;
  captionEl.textContent = `Real signal history across ${history.length} scans.`;
}

/* ── Right rail: Inspector / Job Signals / Contact ── */
function renderInspector() {
  const c = selectedCompany;
  const cls = tierClass(c.tier);

  document.getElementById('inspector-name').textContent = c.company;
  const badge = document.getElementById('inspector-tier-badge');
  badge.textContent = c.tier.toUpperCase();
  badge.className = 'tier-badge' + (cls ? ` tier-${cls}` : '');
  document.getElementById('inspector-index').textContent = c.opportunity_index.toFixed(2);
  document.getElementById('inspector-index').style.color = cls === 'amber' ? 'var(--amber)' : cls === 'rose' ? 'var(--rose)' : 'var(--accent)';
  document.getElementById('inspector-discovery-badge').hidden = c.discovery_source !== 'discovered';

  const websiteLink = document.getElementById('inspector-website-link');
  if (websiteLink) {
    /* visibility, not hidden/display:none — keeps this line's height
       reserved so Momentum Trend below doesn't shift depending on
       whether this particular company has a URL. */
    if (c.company_url) {
      websiteLink.style.visibility = 'visible';
      websiteLink.href = c.company_url;
      websiteLink.textContent = stripUrlProtocol(c.company_url);
    } else {
      websiteLink.style.visibility = 'hidden';
    }
  }

  renderInspectorTrend(c);

  /* News, Reddit, GitHub, and Hacker News are "leading" signals that can
     appear before a role is posted; LinkedIn Jobs is the one "confirming"
     signal, since it requires a role to already be public — labeled as
     two groups here since the math panel has room to actually explain it
     (unlike the compact source pills/bars elsewhere). */
  const mathDefs = [
    { label: 'News', key: 'source-news', value: c.news_signals, weight: WEIGHTS.news, cap: CAPS.news },
    { label: 'Reddit', key: 'source-reddit', value: c.reddit_signals, weight: WEIGHTS.reddit, cap: CAPS.reddit },
    { label: 'GitHub', key: 'source-github', value: c.github_signals, weight: WEIGHTS.github, cap: CAPS.github },
    { label: 'Hacker News', key: 'source-hn', value: c.hn_signals, weight: WEIGHTS.hn, cap: CAPS.hn },
    { label: 'Executive Hires', key: 'source-exec_hire', value: c.exec_hire_signals, weight: WEIGHTS.exec_hire, cap: CAPS.exec_hire },
    { label: 'Funding', key: 'source-funding', value: c.funding_signals, weight: WEIGHTS.funding, cap: CAPS.funding },
    { label: 'Patents', key: 'source-patents', value: c.patent_signals, weight: WEIGHTS.patents, cap: CAPS.patents },
  ];
  const confirmingDefs = [
    { label: 'LinkedIn', key: 'source-linkedin', value: c.linkedin_signals, weight: WEIGHTS.linkedin, cap: CAPS.linkedin },
  ];
  let total = 0;
  function mathRow(d) {
    const norm = Math.min(d.value, d.cap) / d.cap;
    const contribution = norm * d.weight;
    total += contribution;
    return `<div class="math-row"><span class="math-label ${d.key}">${d.label}  <span class="num">${d.value}/${d.cap}</span></span><span class="math-detail num">${norm.toFixed(2)} × ${(d.weight * 100).toFixed(0)}% = ${contribution.toFixed(3)}</span></div>`;
  }
  const rowsHtml = `
    <span class="math-group-label">Leading signals</span>
    ${mathDefs.map(mathRow).join('')}
    <span class="math-group-label">Confirming signal</span>
    ${confirmingDefs.map(mathRow).join('')}
  `;
  document.getElementById('math-rows').innerHTML = rowsHtml;
  document.getElementById('math-total-value').textContent = (Math.round(total * 100) / 100).toFixed(2);

  renderRolesGauge(c.linkedin_signals, CAPS.linkedin);
  document.getElementById('open-roles-value').textContent = c.linkedin_signals;
  const momentumBadge = document.getElementById('hiring-momentum-badge');
  const momentumLabel = c.tier === 'Very Strong' || c.tier === 'Strong' ? 'Actively Growing' : c.tier === 'Moderate' ? 'Steady' : 'Quiet';
  momentumBadge.textContent = momentumLabel;
  momentumBadge.className = 'tier-badge' + (cls ? ` tier-${cls}` : '');
  document.getElementById('gauge-discovery-badge').hidden = c.discovery_source !== 'discovered';
  document.getElementById('why-it-matters-text').innerHTML = generateWhyItMatters(c);

  populateContactCard(c);
}

function selectCompany(companyName) {
  const found = findCompany(companyName);
  if (!found) return;
  selectedCompany = found;
  renderQuadrant();
  renderList();
  renderInspector();
}

/* ── Filter/sort/group controls ── */
searchInput.addEventListener('input', renderList);

sortToggle.addEventListener('click', () => {
  sortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
  sortToggle.classList.toggle('sort-asc', sortDirection === 'asc');
  renderList();
});

groupToggle.addEventListener('click', () => {
  groupByTier = !groupByTier;
  groupToggle.setAttribute('aria-pressed', String(groupByTier));
  renderList();
});

stealthToggle.addEventListener('click', () => {
  stealthFilterOn = !stealthFilterOn;
  stealthToggle.setAttribute('aria-pressed', String(stealthFilterOn));
  renderList();
});

clearButton.addEventListener('click', () => {
  searchInput.value = '';
  sortDirection = 'desc';
  groupByTier = true;
  stealthFilterOn = false;
  sortToggle.classList.remove('sort-asc');
  groupToggle.setAttribute('aria-pressed', 'true');
  stealthToggle.setAttribute('aria-pressed', 'false');
  renderList();
});

/* ── Init: wait for live data before rendering anything that depends
   on it (radar/list/inspector all read `companies`, which is empty
   until the fetch resolves). ── */
const loadingOverlayEl = document.getElementById('loading-overlay');
const fallbackBannerEl = document.getElementById('fallback-banner');

Promise.all([loadCompanyData(), loadContactsData()]).then(() => {
  selectedCompany = companies.slice().sort((a, b) => b.opportunity_index_precise - a.opportunity_index_precise)[0];
  if (!selectedCompany) return; // no usable data even from fallback — leave the loading state up rather than render broken widgets

  renderQuadrant();
  renderList();
  renderInspector();

  if (loadingOverlayEl) loadingOverlayEl.hidden = true;
  if (fallbackBannerEl) fallbackBannerEl.hidden = dataSource !== 'fallback';
});
