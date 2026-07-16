import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"

import type {
  Catalog,
  ComponentEntry,
  GuidelinePage,
  TokenEntry,
  UtilityEntry,
} from "./types.js"

/** Workspace packages the catalog covers; missing ones are skipped. */
const PACKAGE_DIRS = ["packages/currantui", "packages/charts"]
const MAIN_PACKAGE = "@nhic/currantui"

const GLOBALS_CSS = "packages/currantui/src/styles/globals.css"
const RECIPES_DIR = "apps/storybook/recipes"

/** Guideline topic → { source file, page title } */
const GUIDELINE_SOURCES: Record<string, { path: string; title: string }> = {
  "getting-started": {
    path: "apps/storybook/docs/getting-started.mdx",
    title: "Getting Started — install and wire CurrantUI in an app",
  },
  "design-standards": {
    path: "docs/design-standards.md",
    title: "Design Standards — the rules every component and screen follows",
  },
  colors: {
    path: "apps/storybook/docs/colors.mdx",
    title: "Colors — semantic token roles and usage",
  },
  typography: {
    path: "apps/storybook/docs/typography.mdx",
    title: "Typography — fonts, scale, density, lists, radius",
  },
  shell: {
    path: "apps/storybook/docs/shell.mdx",
    title: "Shell — the application chassis (header, side nav, panels)",
  },
  "component-index": {
    path: "apps/storybook/docs/component-index.mdx",
    title: "Component Index — every component grouped by job",
  },
  charts: {
    path: "apps/storybook/docs/charts.mdx",
    title: "Charts — the charting package: data shape, options, shell, export",
  },
  overview: {
    path: "docs/overview.md",
    title: "Overview — why CurrantUI exists, scope, and non-goals",
  },
  architecture: {
    path: "docs/architecture.md",
    title: "Architecture — stack, package contract, tokens, CI/CD",
  },
}

interface PackageInfo {
  dir: string
  name: string
  version: string
}

async function tryRead(repo: string, relPath: string): Promise<string | null> {
  try {
    return await readFile(join(repo, relPath), "utf8")
  } catch {
    return null
  }
}

async function tryReaddir(
  repo: string,
  relPath: string
): Promise<Array<string>> {
  try {
    return await readdir(join(repo, relPath))
  } catch {
    return []
  }
}

function pascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

/** Named exports from `export { A, B as C }` blocks and `export function X` declarations. */
export function parseExports(source: string): Array<string> {
  const names = new Set<string>()
  for (const block of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of (block[1] ?? "").split(",")) {
      const name = raw.trim().split(/\s+as\s+/).pop()?.trim()
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
  }
  for (const decl of source.matchAll(
    /export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/g
  )) {
    if (decl[1]) names.add(decl[1])
  }
  return [...names]
}

/** First JSDoc block in the file, with comment chrome stripped. */
export function parseLeadingJsdoc(source: string): string {
  const match = source.match(/\/\*\*([\s\S]*?)\*\//)
  if (!match) return ""
  return (match[1] ?? "")
    .split("\n")
    .map((line) => line.replace(/^\s*\*? ?/, ""))
    .join("\n")
    .trim()
}

function parseStoryTitle(storySource: string): string | null {
  return storySource.match(/title:\s*"([^"]+)"/)?.[1] ?? null
}

function parseStoryDescription(storySource: string): string | null {
  const match = storySource.match(/component:\s*\n?\s*"((?:[^"\\]|\\.)*)"/)
  return match?.[1]?.replace(/\\"/g, '"') ?? null
}

async function discoverPackages(repo: string): Promise<Array<PackageInfo>> {
  const packages: Array<PackageInfo> = []
  for (const dir of PACKAGE_DIRS) {
    const raw = await tryRead(repo, `${dir}/package.json`)
    if (raw == null) continue
    const parsed = JSON.parse(raw) as { name?: string; version?: string }
    if (parsed.name) {
      packages.push({ dir, name: parsed.name, version: parsed.version ?? "unknown" })
    }
  }
  return packages
}

async function extractComponents(
  repo: string,
  pkg: PackageInfo
): Promise<Array<ComponentEntry>> {
  const componentsDir = `${pkg.dir}/src/components`
  const bases = (await tryReaddir(repo, componentsDir))
    .filter((f) => f.endsWith(".tsx") && !f.endsWith(".stories.tsx"))
    .map((f) => f.replace(/\.tsx$/, ""))
    .sort()

  const components: Array<ComponentEntry> = []
  for (const base of bases) {
    const source = await tryRead(repo, `${componentsDir}/${base}.tsx`)
    if (source == null) continue
    const examples = await tryRead(repo, `${componentsDir}/${base}.stories.tsx`)

    const exports = parseExports(source)
    const pascal = pascalCase(base)
    const title = examples ? parseStoryTitle(examples) : null
    const fallback = pkg.name.includes("charts") ? "Charts" : "Components"
    // "Components/Forms/SelectBoxGroup" → "Forms"; "Charts/BarChart" → "Charts"
    const segments = title?.split("/") ?? []
    const category =
      segments.length >= 2
        ? (segments[segments.length - 2] ?? fallback)
        : fallback

    components.push({
      name: exports.includes(pascal) ? pascal : (exports[0] ?? pascal),
      file: base,
      package: pkg.name,
      importPath: `${pkg.name}/components/${base}`,
      category,
      description:
        (examples ? parseStoryDescription(examples) : null) ??
        parseLeadingJsdoc(source),
      exports,
      deprecated: source.includes("@deprecated"),
      source,
      examples,
    })
  }
  return components
}

/** Variable declarations inside the first `selector { … }` block of the css. */
export function parseCssVariables(
  css: string,
  selector: string
): Map<string, string> {
  const variables = new Map<string, string>()
  const start = css.indexOf(`${selector} {`)
  if (start === -1) return variables
  const open = css.indexOf("{", start)
  let depth = 0
  let end = open
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++
    if (css[i] === "}") depth--
    if (depth === 0) {
      end = i
      break
    }
  }
  const block = css.slice(open + 1, end)
  for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    if (match[1] && match[2]) variables.set(match[1], match[2].trim())
  }
  return variables
}

async function extractTokens(repo: string): Promise<Array<TokenEntry>> {
  const css = await tryRead(repo, GLOBALS_CSS)
  if (css == null) return []
  const light = parseCssVariables(css, ":root")
  const dark = parseCssVariables(css, ".dark")
  const names = new Set([...light.keys(), ...dark.keys()])
  return [...names].map((name) => ({
    name,
    light: light.get(name) ?? null,
    dark: dark.get(name) ?? null,
  }))
}

async function extractGuidelines(
  repo: string
): Promise<Record<string, GuidelinePage>> {
  const guidelines: Record<string, GuidelinePage> = {}
  for (const [topic, { path, title }] of Object.entries(GUIDELINE_SOURCES)) {
    const content = await tryRead(repo, path)
    if (content != null) guidelines[topic] = { title, content }
  }
  return guidelines
}

async function extractRecipes(repo: string): Promise<Record<string, string>> {
  const recipes: Record<string, string> = {}
  const files = await tryReaddir(repo, RECIPES_DIR)
  for (const file of files.filter((f) => f.endsWith(".stories.tsx")).sort()) {
    const source = await tryRead(repo, `${RECIPES_DIR}/${file}`)
    if (source != null) recipes[file.replace(/\.stories\.tsx$/, "")] = source
  }
  return recipes
}

async function extractUtilities(
  repo: string,
  pkg: PackageInfo
): Promise<Array<UtilityEntry>> {
  const utilities: Array<UtilityEntry> = []
  for (const alias of ["lib", "hooks"]) {
    const dir = `${pkg.dir}/src/${alias}`
    const files = await tryReaddir(repo, dir)
    for (const file of files.filter((f) => f.endsWith(".ts")).sort()) {
      const source = await tryRead(repo, `${dir}/${file}`)
      if (source == null) continue
      const base = file.replace(/\.ts$/, "")
      utilities.push({
        name: base,
        package: pkg.name,
        importPath: `${pkg.name}/${alias}/${base}`,
        source,
      })
    }
  }
  return utilities
}

/** Build the full catalog from a CurrantUI repo checkout. */
export async function extractCatalog(repo: string): Promise<Catalog> {
  const packages = await discoverPackages(repo)
  const main = packages.find((pkg) => pkg.name === MAIN_PACKAGE)
  if (!main) {
    throw new Error(
      `Not a CurrantUI checkout: ${repo} (missing ${MAIN_PACKAGE} under packages/)`
    )
  }

  const components: Array<ComponentEntry> = []
  const utilities: Array<UtilityEntry> = []
  for (const pkg of packages) {
    components.push(...(await extractComponents(repo, pkg)))
    utilities.push(...(await extractUtilities(repo, pkg)))
  }

  return {
    version: main.version,
    packages: packages.map(({ name, version }) => ({ name, version })),
    components,
    tokens: await extractTokens(repo),
    guidelines: await extractGuidelines(repo),
    recipes: await extractRecipes(repo),
    utilities,
  }
}
