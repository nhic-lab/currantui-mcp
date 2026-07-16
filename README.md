# currantui-mcp

MCP server that makes any agentic AI application an instant expert in
[CurrantUI](https://github.com/nhic-lab/currantui) — the NHIC React design
system (`@nhic/currantui`) and its charting package (`@nhic/currantui-charts`).
Agents get the full component catalog, real usage examples, design tokens,
guidelines, and recipes, so generated UI code uses the design system instead
of hand-rolling it.

## Tools

| Tool | What it returns |
|---|---|
| `list_components` | Every component: name, category, import path, exports, one-line description (optional category filter) |
| `search_components` | Keyword search across names, exports, and descriptions |
| `get_component` | Full detail for one component — description, import statement, exports, and complete source (the authoritative reference for props and variants); also resolves utilities like `lib/date` |
| `get_component_examples` | The component's stories source — working usage for every variant, including stateful wiring |
| `get_design_tokens` | Semantic CSS-variable tokens with light and dark values (optional substring filter) |
| `get_guidelines` | Docs pages: getting started, design standards, colors, typography, shell, component index, charts, overview, architecture |
| `get_recipe` | Copy-paste recipes for patterns the package deliberately doesn't ship (`rich-table`, `app-shell`) |

## Setup

### Claude Code

```bash
claude mcp add currantui -- pnpm dlx @nhic/currantui-mcp
```

### Any MCP client (stdio)

```json
{
  "mcpServers": {
    "currantui": {
      "command": "pnpm",
      "args": ["dlx", "@nhic/currantui-mcp"]
    }
  }
}
```

### Working on the design system itself

Point the server at a local checkout and it reads the repo live instead of
the bundled snapshot — new components appear without republishing:

```json
{
  "mcpServers": {
    "currantui": {
      "command": "pnpm",
      "args": ["dlx", "@nhic/currantui-mcp"],
      "env": { "CURRANTUI_REPO": "/path/to/currantui" }
    }
  }
}
```

## How it works

A build-time script (`pnpm extract`) snapshots a CurrantUI checkout —
component sources, co-located stories, `globals.css` tokens, docs pages,
recipes — into `data/catalog.json`, which ships inside the npm package. At
runtime the server loads that snapshot, unless `CURRANTUI_REPO` is set, in
which case it extracts live from the checkout on every start.

## Development

```bash
pnpm install
pnpm extract      # snapshot ../currantui (or $CURRANTUI_REPO) into data/
pnpm typecheck
pnpm test         # extraction + tool round-trips over an in-memory transport
pnpm build        # tsup → dist/index.js (the bin)
pnpm dev          # run the server from source
```

Publishing runs `extract → build → test` automatically (`prepublishOnly`), so
the shipped snapshot always matches the CurrantUI version present at publish
time. Re-publish after significant design-system releases.
