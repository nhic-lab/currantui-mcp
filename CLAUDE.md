# currantui-mcp — Claude Navigation Guide

Stdio MCP server (`@nhic/currantui-mcp`) exposing CurrantUI design-system
knowledge to AI agents. TypeScript, ESM only, pnpm only (never npm/yarn).

## Layout

| Path | Purpose |
|---|---|
| `src/extractor.ts` | Pure extraction from a CurrantUI checkout → `Catalog` (components, tokens, guidelines, recipes, utilities) |
| `src/catalog.ts` | Runtime loader: live extract when `CURRANTUI_REPO` is set, else bundled `data/catalog.json` |
| `src/server.ts` | `createServer(catalog)` — registers the seven tools on an `McpServer` |
| `src/index.ts` | Bin entry: load catalog, connect stdio transport |
| `scripts/extract.ts` | Snapshot CLI → `data/catalog.json` (committed; bundled via `files`) |
| `tests/server.test.ts` | Extraction assertions + tool round-trips over `InMemoryTransport` |

## Rules

- The extractor must degrade gracefully: missing files/dirs are skipped, never fatal — it runs against any branch state of the currantui repo.
- Tool payloads: catalogs/summaries as JSON text; sources and docs pages as raw text.
- `data/catalog.json` is a build artifact but committed so `pnpm dlx` from git works; refresh with `pnpm extract` when CurrantUI changes.
- Tests read the sibling `../currantui` checkout (override with `CURRANTUI_REPO`).
- Verify loop: `pnpm typecheck && pnpm extract && pnpm test && pnpm build`, then a stdio smoke: pipe `initialize` / `tools/call` JSON-RPC lines into `node dist/index.js`.
