/* Snapshot a CurrantUI checkout into data/catalog.json (bundled at publish). */
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { extractCatalog } from "../src/extractor.js"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const repo = resolve(
  process.env.CURRANTUI_REPO ?? join(root, "..", "currantui")
)

const catalog = await extractCatalog(repo)
await mkdir(join(root, "data"), { recursive: true })
await writeFile(
  join(root, "data", "catalog.json"),
  JSON.stringify(catalog, null, 2)
)
console.log(
  `Extracted CurrantUI v${catalog.version} from ${repo}: ` +
    `${catalog.components.length} components, ${catalog.tokens.length} tokens, ` +
    `${Object.keys(catalog.guidelines).length} guideline pages, ` +
    `${Object.keys(catalog.recipes).length} recipes, ` +
    `${catalog.utilities.length} utilities`
)
