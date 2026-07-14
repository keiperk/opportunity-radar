/*
 * Dashboard page logic. Company data, scoring formula, and shared helpers
 * live in data.js (loaded before this file).
 */

/* ── DOM refs ── */
const searchInput = document.getElementById('search-input');
const sortToggle = document.getElementById('sort-toggle');
const groupToggle = document.getElementById('group-toggle');
const clearButton = document.getElementById('clear-filters');
const rankedListEl = document.getElementById('ranked-list');
const listEmptyEl = document.getElementById('list-empty');
const companiesTrackedCountEl = document.getElementById('companies-tracked-count');
const radarSvg = document.getElementById('radar-svg');
const viewReportBtn = document.getElementById('view-report-btn');

let sortDirection = 'desc';
let groupByTier = true;
let selectedCompany = null;

/* ── Radar (SVG) ── */
function renderRadar() {
  const CX = 200, CY = 200, MIN_R = 25, MAX_R = 175;
  const ringColor = hexToRgba(THEME.accent, 0.25);
  let svg = '';

  [50, 94, 138, 181].forEach((r) => {
    svg += `<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="${ringColor}" stroke-width="1" />`;
  });
  svg += `<line x1="20" y1="${CY}" x2="380" y2="${CY}" stroke="${ringColor}" stroke-width="1" />`;
  svg += `<line x1="${CX}" y1="20" x2="${CX}" y2="380" stroke="${ringColor}" stroke-width="1" />`;
  svg += `<circle cx="${CX}" cy="${CY}" r="3" fill="${THEME.dark}" />`;

  const FONT_SIZE = 9.5, CHAR_W = FONT_SIZE * 0.58, LINE_H = FONT_SIZE * 1.2;
  const labels = [];

  companies.forEach((c, i) => {
    const angleDeg = -90 + i * (360 / companies.length);
    const angleRad = (angleDeg * Math.PI) / 180;
    const radius = MIN_R + (1 - c.opportunity_index) * (MAX_R - MIN_R);
    const cosV = Math.cos(angleRad), sinV = Math.sin(angleRad);
    const px = CX + radius * cosV, py = CY + radius * sinV;
    const diameter = 8 + c.opportunity_index * 4;
    const opacity = 0.55 + c.opportunity_index * 0.45;
    const isSelected = c.company === selectedCompany.company;

    if (isSelected) {
      const ringD = diameter + 8;
      svg += `<circle cx="${px}" cy="${py}" r="${ringD / 2}" fill="none" stroke="${THEME.dark}" stroke-width="1.5" stroke-dasharray="3 2" />`;
    }
    const blipColor = c.discovery_source === 'discovered' ? THEME.purple : THEME.reddit;
    svg += `<circle class="radar-blip" data-company="${c.company}" cx="${px}" cy="${py}" r="${diameter / 2}" fill="${blipColor}" opacity="${opacity}" style="cursor:pointer" />`;

    let anchor = 'middle', labelR = radius;
    if (cosV > 0.3) anchor = 'start';
    else if (cosV < -0.3) anchor = 'end';

    labels.push({ company: c.company, cosV, sinV, anchor, diameter, labelR });
  });

  /* Label collision avoidance: push overlapping labels further out along
     their own angle (dots stay put — only the text moves) until clear. */
  function labelPos(l) {
    const px = CX + l.labelR * l.cosV, py = CY + l.labelR * l.sinV;
    let x = px, y = py;
    if (l.cosV > 0.3) x = px + l.diameter / 2 + 5;
    else if (l.cosV < -0.3) x = px - l.diameter / 2 - 5;
    if (l.sinV < -0.3) y = py - l.diameter / 2 - 5;
    else if (l.sinV > 0.3) y = py + l.diameter / 2 + 11;
    return { x, y };
  }
  function bbox(l) {
    const { x, y } = labelPos(l);
    const w = l.company.length * CHAR_W;
    const left = l.anchor === 'start' ? x : l.anchor === 'end' ? x - w : x - w / 2;
    return { left, right: left + w, top: y - LINE_H, bottom: y + LINE_H * 0.3 };
  }
  function overlaps(a, b) {
    const A = bbox(a), B = bbox(b);
    return A.left < B.right && A.right > B.left && A.top < B.bottom && A.bottom > B.top;
  }

  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = 0; j < i; j++) {
        if (overlaps(labels[i], labels[j])) {
          labels[i].labelR += 9;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  labels.forEach((l) => {
    const { x, y } = labelPos(l);
    svg += `<text data-company="${l.company}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${l.anchor}" font-size="${FONT_SIZE}" font-weight="600" font-family="Inter, sans-serif" fill="${THEME.dark}" style="cursor:pointer">${escapeXml(l.company)}</text>`;
  });

  radarSvg.innerHTML = svg;
  radarSvg.querySelectorAll('[data-company]').forEach((el) => {
    el.addEventListener('click', () => selectCompany(el.getAttribute('data-company')));
  });
}

/* ── Ranked list ── */
function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = companies.filter((c) => !query || c.company.toLowerCase().includes(query));
  const sorted = filtered.slice().sort((a, b) =>
    sortDirection === 'desc' ? b.opportunity_index_precise - a.opportunity_index_precise : a.opportunity_index_precise - b.opportunity_index_precise
  );

  rankedListEl.innerHTML = '';
  listEmptyEl.hidden = sorted.length !== 0;
  companiesTrackedCountEl.textContent = `${companies.length} companies tracked`;

  function renderRow(c) {
    const cls = tierClass(c.tier);
    const contrib = computeContributions(c);
    const row = document.createElement('div');
    row.className = 'company-row' + (c.company === selectedCompany.company ? ' selected' : '');
    row.dataset.company = c.company;

    const discoveryBadge = c.discovery_source === 'discovered'
      ? `<span class="discovery-badge" title="Newly discovered this scan — not on the existing tracked list">New Discovery</span>`
      : '';

    row.innerHTML = `
      <div class="company-row-top">
        <div class="company-row-name-group">
          <a class="company-row-name" href="detail.html?company=${encodeURIComponent(c.company)}">${escapeXml(c.company)}</a>
          ${discoveryBadge}
        </div>
        <span class="company-row-index ${cls}">${c.opportunity_index.toFixed(2)}</span>
      </div>
      <div class="company-row-sources">
        <span class="source-pill source-news">News ${c.news_signals}</span>
        <span class="source-pill source-reddit">Reddit ${c.reddit_signals}</span>
        <span class="source-pill source-linkedin">LinkedIn ${c.linkedin_signals}</span>
        <span class="source-pill source-github">GitHub ${c.github_signals}</span>
        <span class="source-pill source-hn">HN ${c.hn_signals}</span>
      </div>
      <div class="meter-track meter-track-segmented">
        ${[
          { label: 'News', cls: 'source-news', value: c.news_signals, cap: CAPS.news, pct: contrib.news * 100 },
          { label: 'Reddit', cls: 'source-reddit', value: c.reddit_signals, cap: CAPS.reddit, pct: contrib.reddit * 100 },
          { label: 'LinkedIn', cls: 'source-linkedin', value: c.linkedin_signals, cap: CAPS.linkedin, pct: contrib.linkedin * 100 },
          { label: 'GitHub', cls: 'source-github', value: c.github_signals, cap: CAPS.github, pct: contrib.github * 100 },
          { label: 'Hacker News', cls: 'source-hn', value: c.hn_signals, cap: CAPS.hn, pct: contrib.hn * 100 },
        ].map((s) => `<div class="meter-segment ${s.cls}" style="width:${s.pct.toFixed(1)}%" title="${s.label}: ${s.value}/${s.cap} mentions — ${s.pct.toFixed(1)}% of this company's score"></div>`).join('')}
      </div>
    `;
    row.addEventListener('click', () => selectCompany(c.company));
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
    header.innerHTML = `<span class="tier-group-dot ${cls}"></span><span class="tier-group-label ${cls}">${tierName.toUpperCase()} — ${members.length}</span>`;
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
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${THEME.purple}" stroke-width="${stroke}"
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
  document.getElementById('inspector-index').style.color = cls === 'amber' ? 'var(--amber-deep)' : cls === 'rose' ? 'var(--rose-deep)' : 'var(--accent-deep)';
  document.getElementById('inspector-discovery-badge').hidden = c.discovery_source !== 'discovered';

  const sourceDefs = [
    { label: 'News', key: 'source-news', value: c.news_signals, cap: CAPS.news },
    { label: 'Reddit', key: 'source-reddit', value: c.reddit_signals, cap: CAPS.reddit },
    { label: 'LinkedIn', key: 'source-linkedin', value: c.linkedin_signals, cap: CAPS.linkedin },
    { label: 'GitHub', key: 'source-github', value: c.github_signals, cap: CAPS.github },
    { label: 'Hacker News', key: 'source-hn', value: c.hn_signals, cap: CAPS.hn },
  ];
  const breakdownEl = document.getElementById('signal-breakdown');
  breakdownEl.innerHTML = sourceDefs.map((s) => `
    <div class="mini-breakdown-row">
      <div class="mini-breakdown-top"><span class="label">${s.label}</span><span class="value">${s.value}</span></div>
      <div class="meter-track"><div class="meter-fill ${s.key}" style="width:${Math.min(100, (s.value / s.cap) * 100).toFixed(0)}%"></div></div>
    </div>
  `).join('');

  const top = sourceDefs.reduce((a, b) => (b.value > a.value ? b : a));
  document.getElementById('strongest-signal-text').textContent = `${top.label} — ${top.value} mentions this scan`;

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
  ];
  const confirmingDefs = [
    { label: 'LinkedIn', key: 'source-linkedin', value: c.linkedin_signals, weight: WEIGHTS.linkedin, cap: CAPS.linkedin },
  ];
  let total = 0;
  function mathRow(d) {
    const norm = Math.min(d.value, d.cap) / d.cap;
    const contribution = norm * d.weight;
    total += contribution;
    return `<div class="math-row"><span class="math-label ${d.key}">${d.label}  ${d.value}/${d.cap}</span><span class="math-detail">${norm.toFixed(2)} × ${(d.weight * 100).toFixed(0)}% = ${contribution.toFixed(3)}</span></div>`;
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

  const emailHandle = c.company.toLowerCase().replace(/[^a-z0-9]+/g, '');
  document.getElementById('contact-title').textContent = `Engineering Recruiter · ${c.company}`;
  document.getElementById('contact-email').textContent = `jordan.reyes@${emailHandle}.com`;

  if (viewReportBtn) viewReportBtn.href = `detail.html?company=${encodeURIComponent(c.company)}`;
}

function selectCompany(companyName) {
  const found = findCompany(companyName);
  if (!found) return;
  selectedCompany = found;
  renderRadar();
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

clearButton.addEventListener('click', () => {
  searchInput.value = '';
  sortDirection = 'desc';
  groupByTier = true;
  sortToggle.classList.remove('sort-asc');
  groupToggle.setAttribute('aria-pressed', 'true');
  renderList();
});

/* ── Scan Summary: which source is actually worth comparing candidates
   by this scan. News/Reddit/LinkedIn commonly cluster near their caps
   for every company (little to no spread), so they don't help tell
   candidates apart — whichever source has real spread is the one worth
   checking before deciding who to contact first. ── */
function renderScanSummary() {
  const SOURCE_FIELDS = [
    { key: 'news_signals', label: 'News', cls: 'source-news' },
    { key: 'reddit_signals', label: 'Reddit', cls: 'source-reddit' },
    { key: 'linkedin_signals', label: 'LinkedIn', cls: 'source-linkedin' },
    { key: 'github_signals', label: 'GitHub', cls: 'source-github' },
    { key: 'hn_signals', label: 'Hacker News', cls: 'source-hn' },
  ];
  const ranges = SOURCE_FIELDS.map((s) => {
    const values = companies.map((c) => c[s.key]);
    return { ...s, range: Math.max(...values) - Math.min(...values) };
  });
  const maxRange = Math.max(...ranges.map((s) => s.range), 1);
  const widest = ranges.reduce((a, b) => (b.range > a.range ? b : a));

  document.getElementById('scan-summary-variance-text').innerHTML =
    `<strong>${widest.label}</strong> has the widest spread this scan — the most reliable source for telling candidates apart before you decide who to contact.`;

  document.getElementById('scan-variance-bars').innerHTML = ranges.map((s) => `
    <div class="variance-bar-row${s.range === maxRange ? ' is-widest' : ''}">
      <span class="variance-bar-label">${s.label}</span>
      <div class="variance-bar-track"><div class="variance-bar-fill ${s.cls}" style="width:${((s.range / maxRange) * 100).toFixed(0)}%"></div></div>
    </div>
  `).join('');
}

/* ── Init: wait for live data before rendering anything that depends
   on it (radar/list/inspector all read `companies`, which is empty
   until the fetch resolves). ── */
const loadingOverlayEl = document.getElementById('loading-overlay');
const fallbackBannerEl = document.getElementById('fallback-banner');

loadCompanyData().then(() => {
  selectedCompany = companies.slice().sort((a, b) => b.opportunity_index_precise - a.opportunity_index_precise)[0];
  if (!selectedCompany) return; // no usable data even from fallback — leave the loading state up rather than render broken widgets

  renderRadar();
  renderList();
  renderInspector();
  renderScanSummary();

  if (loadingOverlayEl) loadingOverlayEl.hidden = true;
  if (fallbackBannerEl) fallbackBannerEl.hidden = dataSource !== 'fallback';
});
