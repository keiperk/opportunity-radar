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

let sortDirection = 'desc';
let groupByTier = true;
let selectedCompany = null;
let expandedCompany = null; // which row's per-source detail is toggled open (click, not hover)

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

  const FONT_SIZE = 11.5, LINE_H = FONT_SIZE * 1.2, LABEL_GAP = 6, MAX_LABEL_W = 130;
  const measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = `600 ${FONT_SIZE}px Inter, sans-serif`;
  /* Discovered-company names can run very long (40+ chars); left unchecked
     their label boxes run off the chart edge and collide with neighboring
     labels. Truncate what's shown on the radar itself — the full name is
     still used for selection and still shown everywhere else. */
  function truncateLabel(text) {
    if (measureCtx.measureText(text).width <= MAX_LABEL_W) return text;
    let t = text;
    while (t.length > 1 && measureCtx.measureText(t + '…').width > MAX_LABEL_W) t = t.slice(0, -1);
    return t + '…';
  }
  const labels = [];

  companies.forEach((c, i) => {
    const angleDeg = -90 + i * (360 / companies.length);
    const angleRad = (angleDeg * Math.PI) / 180;
    const radius = MIN_R + (1 - c.opportunity_index) * (MAX_R - MIN_R);
    const cosV = Math.cos(angleRad), sinV = Math.sin(angleRad);
    const px = CX + radius * cosV, py = CY + radius * sinV;
    const diameter = 11 + c.opportunity_index * 5;
    const opacity = 0.55 + c.opportunity_index * 0.45;
    const isSelected = c.company === selectedCompany.company;

    if (isSelected) {
      const ringD = diameter + 8;
      svg += `<circle cx="${px}" cy="${py}" r="${ringD / 2}" fill="none" stroke="${THEME.dark}" stroke-width="1.5" stroke-dasharray="3 2" />`;
    }
    const blipColor = c.discovery_source === 'discovered' ? THEME.accent : THEME.reddit;
    svg += `<circle class="radar-blip" data-company="${c.company}" cx="${px}" cy="${py}" r="${diameter / 2}" fill="${blipColor}" opacity="${opacity}" style="cursor:pointer" />`;

    let anchor = 'middle', labelR = radius;
    if (cosV > 0.3) anchor = 'start';
    else if (cosV < -0.3) anchor = 'end';

    labels.push({ company: c.company, label: truncateLabel(c.company), cosV, sinV, anchor, diameter, labelR });
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
    const w = measureCtx.measureText(l.label).width + LABEL_GAP;
    const left = (l.anchor === 'start' ? x : l.anchor === 'end' ? x - w : x - w / 2) - LABEL_GAP / 2;
    return { left, right: left + w, top: y - LINE_H, bottom: y + LINE_H * 0.3 };
  }
  function overlaps(a, b) {
    const A = bbox(a), B = bbox(b);
    return A.left < B.right && A.right > B.left && A.top < B.bottom && A.bottom > B.top;
  }

  for (let pass = 0; pass < 30; pass++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++) {
      for (let j = 0; j < i; j++) {
        if (overlaps(labels[i], labels[j])) {
          labels[i].labelR += 12;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  labels.forEach((l) => {
    const { x, y } = labelPos(l);
    svg += `<text data-company="${l.company}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${l.anchor}" font-size="${FONT_SIZE}" font-weight="600" font-family="Inter, sans-serif" fill="${THEME.radarLabel}" style="cursor:pointer"><title>${escapeXml(l.company)}</title>${escapeXml(l.label)}</text>`;
  });

  radarSvg.innerHTML = svg;
  radarSvg.querySelectorAll('[data-company]').forEach((el) => {
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
  const query = searchInput.value.trim().toLowerCase();
  const filtered = companies.filter((c) => !query || c.company.toLowerCase().includes(query));
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

    const sourceDefs = [
      { label: 'News', cls: 'source-news', value: c.news_signals, cap: CAPS.news, weight: WEIGHTS.news },
      { label: 'Reddit', cls: 'source-reddit', value: c.reddit_signals, cap: CAPS.reddit, weight: WEIGHTS.reddit },
      { label: 'LinkedIn', cls: 'source-linkedin', value: c.linkedin_signals, cap: CAPS.linkedin, weight: WEIGHTS.linkedin },
      { label: 'GitHub', cls: 'source-github', value: c.github_signals, cap: CAPS.github, weight: WEIGHTS.github },
      { label: 'Hacker News', cls: 'source-hn', value: c.hn_signals, cap: CAPS.hn, weight: WEIGHTS.hn },
      { label: 'Executive Hires', cls: 'source-exec_hire', value: c.exec_hire_signals, cap: CAPS.exec_hire, weight: WEIGHTS.exec_hire },
      { label: 'Funding', cls: 'source-funding', value: c.funding_signals, cap: CAPS.funding, weight: WEIGHTS.funding },
    ];
    const detailHtml = sourceDefs.map((s) => {
      const norm = Math.min(s.value, s.cap) / s.cap;
      const contribution = norm * s.weight;
      const atCap = s.value >= s.cap;
      return `
        <div class="row-detail-item">
          <span class="row-detail-label ${s.cls}">${s.label}${atCap ? '<span class="row-detail-cap-flag" title="This source hit its scoring cap — real activity may be higher than what\'s shown">At cap</span>' : ''}</span>
          <span class="row-detail-value">${s.value}<span class="row-detail-cap">/${s.cap}</span> <span class="row-detail-contrib">${contribution.toFixed(3).replace(/^0\./, '.')}</span></span>
        </div>
      `;
    }).join('');

    row.innerHTML = `
      <div class="company-row-top">
        <div class="company-row-name-group">
          <a class="company-row-name" href="detail.html?company=${encodeURIComponent(c.company)}">${escapeXml(c.company)}</a>
          ${discoveryBadge}
        </div>
        <div class="company-row-right">
          ${renderMomentumBadge(c)}
          <span class="company-row-index ${cls}">${c.opportunity_index.toFixed(2).replace(/^0\./, '.')}</span>
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
  document.getElementById('inspector-index').textContent = c.opportunity_index.toFixed(2).replace(/^0\./, '.');
  document.getElementById('inspector-index').style.color = cls === 'amber' ? 'var(--amber-deep)' : cls === 'rose' ? 'var(--rose-deep)' : 'var(--accent-deep)';
  document.getElementById('inspector-discovery-badge').hidden = c.discovery_source !== 'discovered';

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
  ];
  const confirmingDefs = [
    { label: 'LinkedIn', key: 'source-linkedin', value: c.linkedin_signals, weight: WEIGHTS.linkedin, cap: CAPS.linkedin },
  ];
  let total = 0;
  function mathRow(d) {
    const norm = Math.min(d.value, d.cap) / d.cap;
    const contribution = norm * d.weight;
    total += contribution;
    return `<div class="math-row"><span class="math-label ${d.key}">${d.label}  <span class="num">${d.value}/${d.cap}</span></span><span class="math-detail num">${norm.toFixed(2).replace(/^0\./, '.')} × ${(d.weight * 100).toFixed(0)}% = ${contribution.toFixed(3).replace(/^0\./, '.')}</span></div>`;
  }
  const rowsHtml = `
    <span class="math-group-label">Leading signals</span>
    ${mathDefs.map(mathRow).join('')}
    <span class="math-group-label">Confirming signal</span>
    ${confirmingDefs.map(mathRow).join('')}
  `;
  document.getElementById('math-rows').innerHTML = rowsHtml;
  document.getElementById('math-total-value').textContent = (Math.round(total * 100) / 100).toFixed(2).replace(/^0\./, '.');

  renderRolesGauge(c.linkedin_signals, CAPS.linkedin);
  document.getElementById('open-roles-value').textContent = c.linkedin_signals;
  const momentumBadge = document.getElementById('hiring-momentum-badge');
  const momentumLabel = c.tier === 'Very Strong' || c.tier === 'Strong' ? 'Actively Growing' : c.tier === 'Moderate' ? 'Steady' : 'Quiet';
  momentumBadge.textContent = momentumLabel;
  momentumBadge.className = 'tier-badge' + (cls ? ` tier-${cls}` : '');
  document.getElementById('gauge-discovery-badge').hidden = c.discovery_source !== 'discovered';
  document.getElementById('why-it-matters-text').innerHTML = generateWhyItMatters(c);

  /* Capped — some discovered "company" names are actually whole clauses
     the discovery LLM extracted (e.g. "Unspecified AI startup by former
     Target executive"), and an uncapped handle turns those into an
     absurdly long, unrealistic-looking email domain. */
  const emailHandle = c.company.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  document.getElementById('contact-title').textContent = `Engineering Recruiter · ${c.company}`;
  document.getElementById('contact-email').textContent = `jordan.reyes@${emailHandle}.com`;
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

  if (loadingOverlayEl) loadingOverlayEl.hidden = true;
  if (fallbackBannerEl) fallbackBannerEl.hidden = dataSource !== 'fallback';
});
