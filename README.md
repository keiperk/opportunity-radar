# Opportunity Radar Dashboard

A static HTML/CSS/JS dashboard for **Opportunity Radar** — company-level momentum
signals derived from hiring activity, news, funding, Reddit, and LinkedIn
mentions, scored by an AI analysis step in an n8n workflow.

## What it does

- Renders a filterable table of companies, each with a normalized momentum
  score, an AI-generated trend summary, and the model's reasoning.
- A right-hand insights panel summarizes the latest workflow run: status,
  total signals processed, companies analyzed, average momentum, and the
  top-momentum company.
- The data shape mirrors the two Google Sheets tabs the reference n8n
  workflow writes to (`radar_results`, `radar_runs`) — see
  `Opportunity Radar v0 Draft Version copy 2.json`. The dashboard currently
  runs on local sample data in `app.js`; there's no live n8n or Sheets
  connection.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure — header, filter bar, results table, insights panel. |
| `styles.css` | Visual styling (shadcn/ui-inspired design tokens, layout, badges). |
| `app.js` | Sample data plus rendering/filtering logic. |
| `Opportunity Radar v0 Draft Version copy 2.json` | The n8n workflow this dashboard's data model is based on (reference only, not connected). |

## Running it

No build step or dependencies. Either open `index.html` directly in a
browser, or serve the folder locally:

```
python3 -m http.server 8934
```

then visit `http://localhost:8934/index.html`.

## Filters

- **Search** — matches on company name.
- **Momentum** — High (≥70%) / Moderate (40–69%) / Low (<40%). Scores are
  normalized regardless of whether the raw value is on a 1–5 scale or a
  0–1 scale.
- **Workflow Status** — Success / Failed, resolved per-row from the run
  that produced it.
- **Clear** — resets all filters.

The insights panel always reflects the full dataset and does not change
with the active filters.

`Refresh` and `Export` in the header are currently visual-only.

