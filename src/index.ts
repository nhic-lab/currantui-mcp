import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

import { loadCatalog } from "./catalog.js"
import { createServer } from "./server.js"

const catalog = await loadCatalog()
const server = createServer(catalog)
await server.connect(new StdioServerTransport())
console.error(
  `currantui-mcp ready — CurrantUI v${catalog.version}, ${catalog.components.length} components`
)
