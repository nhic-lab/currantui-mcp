import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { extractCatalog } from "./extractor.js"
import type { Catalog } from "./types.js"

/**
 * Load the catalog: live from a local checkout when CURRANTUI_REPO is set
 * (never stale while working on the design system), otherwise the snapshot
 * bundled with this package at publish time.
 */
export async function loadCatalog(): Promise<Catalog> {
  const repo = process.env.CURRANTUI_REPO
  if (repo) return extractCatalog(repo)

  const bundled = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "data",
    "catalog.json"
  )
  try {
    return JSON.parse(await readFile(bundled, "utf8")) as Catalog
  } catch (cause) {
    throw new Error(
      "No bundled catalog found and CURRANTUI_REPO is not set. " +
        "Point CURRANTUI_REPO at a CurrantUI checkout or reinstall the package.",
      { cause }
    )
  }
}
