import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { Catalog, ComponentEntry } from "./types.js"

const SETUP_SNIPPET = `## Consuming CurrantUI

\`\`\`bash
pnpm add @nhic/currantui
pnpm add @nhic/currantui-charts   # charts (Charts category), optional
\`\`\`

One CSS line in the app stylesheet:

\`\`\`css
@import "@nhic/currantui/globals.css";
\`\`\`

Imports follow the file name:

\`\`\`tsx
import { Button } from "@nhic/currantui/components/button"
import { BarChart } from "@nhic/currantui-charts/components/bar-chart"
import { parseDate } from "@nhic/currantui/lib/date"
\`\`\`

Icons are @phosphor-icons/react; react, react-dom, and tailwindcss are peer dependencies.`

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] }
}

function json(value: unknown) {
  return text(JSON.stringify(value, null, 2))
}

function componentSummary(component: ComponentEntry) {
  return {
    name: component.name,
    category: component.category,
    importPath: component.importPath,
    exports: component.exports,
    description: component.description.split("\n")[0] ?? "",
    ...(component.deprecated ? { deprecated: true } : {}),
  }
}

function findComponent(
  catalog: Catalog,
  name: string
): ComponentEntry | undefined {
  const needle = name.toLowerCase().replace(/[^a-z0-9]/g, "")
  return catalog.components.find(
    (component) =>
      component.name.toLowerCase() === needle ||
      component.file.replace(/-/g, "") === needle ||
      component.exports.some((entry) => entry.toLowerCase() === needle)
  )
}

function scoreComponent(component: ComponentEntry, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  let score = 0
  const name = component.name.toLowerCase()
  const haystack = [
    component.name,
    component.file,
    component.category,
    component.description,
    component.exports.join(" "),
  ]
    .join(" ")
    .toLowerCase()
  for (const term of terms) {
    if (name === term) score += 10
    else if (name.includes(term)) score += 5
    if (haystack.includes(term)) score += 1
  }
  return score
}

export function createServer(catalog: Catalog): McpServer {
  const server = new McpServer(
    { name: "currantui-mcp", version: catalog.version },
    {
      instructions:
        `Expert knowledge for CurrantUI, the NHIC React design system (${catalog.packages
          .map((pkg) => `${pkg.name}@${pkg.version}`)
          .join(", ")}). ` +
        "Start with list_components or search_components to find the right building block, " +
        "get_component for its full source and props, get_component_examples for copyable usage, " +
        "get_guidelines('design-standards') before writing custom UI, and get_design_tokens for theming. " +
        "Charts live in the Charts category (get_guidelines('charts') for the data/options contract). " +
        "Never hand-roll UI an existing component covers.",
    }
  )

  server.registerTool(
    "list_components",
    {
      title: "List CurrantUI components",
      description:
        "Catalog of every CurrantUI component: name, category, import path, exports, one-line description. " +
        "Optionally filter by category (e.g. Forms, Components).",
      inputSchema: {
        category: z
          .string()
          .optional()
          .describe("Filter by Storybook category, e.g. 'Forms'"),
      },
    },
    async ({ category }) => {
      const components = catalog.components.filter(
        (component) =>
          !category ||
          component.category.toLowerCase() === category.toLowerCase()
      )
      return json({
        version: catalog.version,
        count: components.length,
        setup: SETUP_SNIPPET,
        components: components.map(componentSummary),
      })
    }
  )

  server.registerTool(
    "search_components",
    {
      title: "Search CurrantUI components",
      description:
        "Keyword search across component names, exports, categories, and descriptions. " +
        "Use when unsure which component covers a need (e.g. 'bulk selection actions', 'date range').",
      inputSchema: {
        query: z.string().describe("Keywords, e.g. 'toast notification'"),
      },
    },
    async ({ query }) => {
      const matches = catalog.components
        .map((component) => ({
          component,
          score: scoreComponent(component, query),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((entry) => componentSummary(entry.component))
      return json({ query, matches })
    }
  )

  server.registerTool(
    "get_component",
    {
      title: "Get a CurrantUI component",
      description:
        "Full detail for one component: description, import statement, exports, deprecation, and the " +
        "complete TypeScript source (the source is the authoritative reference for props and variants).",
      inputSchema: {
        name: z
          .string()
          .describe("Component name, e.g. 'Button', 'date-picker', 'ListView'"),
      },
    },
    async ({ name }) => {
      const component = findComponent(catalog, name)
      if (!component) {
        const utility = catalog.utilities.find(
          (entry) =>
            entry.name.replace(/-/g, "") ===
            name.toLowerCase().replace(/[^a-z0-9]/g, "")
        )
        if (utility) return json(utility)
        return json({
          error: `No component named '${name}'.`,
          hint: "Use list_components or search_components to find the right name.",
        })
      }
      const { examples, ...detail } = component
      return json({
        ...detail,
        import: `import { ${component.exports.join(", ")} } from "${component.importPath}"`,
        hasExamples: examples != null,
      })
    }
  )

  server.registerTool(
    "get_component_examples",
    {
      title: "Get usage examples for a component",
      description:
        "The component's Storybook stories source — real, working usage examples for every variant and " +
        "state, including stateful wiring where the component is controlled.",
      inputSchema: {
        name: z.string().describe("Component name, e.g. 'ActionBar'"),
      },
    },
    async ({ name }) => {
      const component = findComponent(catalog, name)
      if (!component) {
        return json({
          error: `No component named '${name}'.`,
          hint: "Use list_components or search_components to find the right name.",
        })
      }
      if (!component.examples) {
        return json({ error: `${component.name} has no examples file.` })
      }
      return text(component.examples)
    }
  )

  server.registerTool(
    "get_design_tokens",
    {
      title: "Get CurrantUI design tokens",
      description:
        "Semantic CSS-variable tokens with light and dark values (colors, radius, fonts, charts, sidebar, " +
        "status). Components consume tokens only — never hardcode colors. Optionally filter by substring.",
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe("Substring filter, e.g. 'primary', 'chart', 'success'"),
      },
    },
    async ({ filter }) => {
      const tokens = catalog.tokens.filter(
        (token) =>
          !filter || token.name.toLowerCase().includes(filter.toLowerCase())
      )
      return json({
        usage:
          "Use Tailwind utilities wired to these tokens (bg-primary, text-muted-foreground, " +
          "border-border…). Status recipe: alpha tints, e.g. bg-success/10 text-success.",
        tokens,
      })
    }
  )

  server.registerTool(
    "get_guidelines",
    {
      title: "Get CurrantUI guidelines",
      description:
        "Design-system documentation pages. Topics: " +
        Object.entries(catalog.guidelines)
          .map(([topic, page]) => `'${topic}' (${page.title})`)
          .join("; ") +
        ". Call without a topic to list them.",
      inputSchema: {
        topic: z
          .string()
          .optional()
          .describe("e.g. 'design-standards', 'getting-started'"),
      },
    },
    async ({ topic }) => {
      if (!topic) {
        return json({
          topics: Object.fromEntries(
            Object.entries(catalog.guidelines).map(([key, page]) => [
              key,
              page.title,
            ])
          ),
          setup: SETUP_SNIPPET,
        })
      }
      const page = catalog.guidelines[topic.toLowerCase()]
      if (!page) {
        return json({
          error: `No guideline topic '${topic}'.`,
          topics: Object.keys(catalog.guidelines),
        })
      }
      return text(`# ${page.title}\n\n${page.content}`)
    }
  )

  server.registerTool(
    "get_recipe",
    {
      title: "Get a CurrantUI recipe",
      description:
        "Copy-paste recipes for larger patterns the package deliberately does not ship as components. " +
        `Available: ${Object.keys(catalog.recipes).join(", ") || "none"}. ` +
        "Call without a name to list them.",
      inputSchema: {
        name: z.string().optional().describe("e.g. 'rich-table', 'app-shell'"),
      },
    },
    async ({ name }) => {
      if (!name) {
        return json({ recipes: Object.keys(catalog.recipes) })
      }
      const recipe = catalog.recipes[name.toLowerCase()]
      if (!recipe) {
        return json({
          error: `No recipe named '${name}'.`,
          recipes: Object.keys(catalog.recipes),
        })
      }
      return text(recipe)
    }
  )

  return server
}
