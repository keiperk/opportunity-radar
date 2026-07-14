# Claude Code + Figma Setup

How the Figma connection used throughout this project is configured, in case it
ever needs to be redone from scratch.

## Step-by-step: how this was actually set up (terminal only)

Confirmed: this was done entirely from the terminal. The VS Code
marketplace/extension path was not used to get Figma working — no evidence of
it in this environment (no `.vscode` config, no `code` CLI installed), and
that matches: the marketplace wasn't reachable/used from VS Code or from
Claude in this setup. Don't rely on the extension route below unless it's
independently confirmed to work — treat the terminal path as the real one.

1. **Install Claude Code (terminal).**
   ```
   npm install -g @anthropic-ai/claude-code
   ```

2. **Sign in.**
   Run `claude` and follow the login prompt. This authenticates the CLI
   against your Anthropic/Claude account — separate from the Figma step below.

3. **Register the Figma MCP server** (one time, per machine):
   ```
   claude mcp add figma --transport http https://mcp.figma.com/mcp
   ```
   This writes the `figma` entry into your **global** `~/.claude.json` — see
   below. It's not tied to any one project folder.

4. **Authorize Figma.** The first time Claude actually calls a Figma tool
   (e.g. you paste a Figma URL and ask it to look at a frame), a browser
   window opens asking you to log into Figma and approve access. This is a
   one-time OAuth handshake; after approving it, the connection persists.

5. **Verify it works.** `cd` into a project, run `claude`, and paste a Figma
   frame URL (must include `?node-id=...`) with a request like "what's in
   this frame?" If it responds with real frame contents, the connection is
   live.

6. **(Optional) Link a running editor window.** Run `/ide` inside a terminal
   Claude Code session to connect to an open editor window for live
   file/diagnostics awareness. Not required for Figma access — a separate,
   optional feature, and not confirmed to have been used here either.

### About the VS Code extension (unconfirmed)

Anthropic does publish a "Claude Code" VS Code extension that wraps the same
CLI and would, in theory, read the same global `~/.claude.json` — meaning
Figma access would carry over automatically if the extension works on a given
machine. But since the marketplace wasn't accessible in your prior attempt,
don't assume this path works without testing it fresh. If you try it again
and hit the same wall, the terminal path above is the fallback that's
actually proven to work.

## The actual setup (one command)

Figma access comes from a single global MCP server registration — not a local
plugin, not project-specific config:

```
claude mcp add figma --transport http https://mcp.figma.com/mcp
```

This is Figma's own hosted MCP endpoint. Running it once adds this to your
**global** `~/.claude.json` (applies to every project on the machine, not just
this one):

```json
"mcpServers": {
  "figma": {
    "type": "http",
    "url": "https://mcp.figma.com/mcp"
  }
}
```

The first time a Claude Code session actually calls a Figma tool, it triggers a
one-time OAuth login prompt in your browser. After that, the connection just
works — nothing project-level to re-configure.

## Using this from VS Code instead of the terminal

The VS Code extension runs the same underlying Claude Code CLI and reads the
same global `~/.claude.json`. If the `mcp add` command above has already been
run on a machine, opening the VS Code extension there gets Figma access
automatically — no separate setup step.

(Separately, `~/.claude/ide/*.lock` files indicate Claude Code's IDE
integration — the `/ide` command that lets a terminal session see open
files/diagnostics in a running editor — has been used at some point. That's
unrelated to Figma access; it's a different feature.)

## Figma files referenced in this project

**Design system library** (`72pguR6uaax5b5vK3BwgDG`) — "shadcn/ui components
with variables & Tailwind classes" — the community component library used for
Badge/Input/Calendar instances, and where early exploration happened (page
"Claude Testing", node `3002:5361`).

**Opportunity Radar working file** (`gdiW4jh2r78DBEevbhRymI`) — "Untitled" —
the dedicated file for the Opportunity Radar dashboard concept:
- `1:2` — Dark mode dashboard
- `12:2` — Light mode dashboard (main/most current version, 3-column layout)
- `32:2` — shadcn-component comparison clone of the light mode dashboard
- `52:13` — Company Detail page (3-column layout matching the main dashboard)

Frame URLs follow the pattern:
`https://www.figma.com/design/<fileKey>/<name>?node-id=<node-id-with-dash>`

## Related local files

- `index.html` / `styles.css` / `app.js` — a separate, earlier static HTML/CSS/JS
  build of the Opportunity Radar dashboard (not the Figma mockups above).
- `Opportunity Radar v2 - Stage 0 Test (3).json` — the n8n workflow export whose
  data model (`company_display`, `news_signals`, `reddit_signals`,
  `linkedin_signals`, `opportunity_index`) the dashboard's fields and scoring
  formula are based on.
