import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { beforeAll, describe, expect, it } from "vitest"

import { extractCatalog } from "../src/extractor.js"
import { createServer } from "../src/server.js"
import type { Catalog } from "../src/types.js"

const REPO = process.env.CURRANTUI_REPO ?? new URL("../../currantui", import.meta.url).pathname

let catalog: Catalog
let client: Client

async function callText(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as Array<{ type: string; text: string }>
  expect(content[0]?.type).toBe("text")
  return content[0]?.text ?? ""
}

async function callJson(name: string, args: Record<string, unknown> = {}) {
  return JSON.parse(await callText(name, args)) as Record<string, unknown>
}

beforeAll(async () => {
  catalog = await extractCatalog(REPO)
  const server = createServer(catalog)
  client = new Client({ name: "test", version: "0.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])
})

describe("extraction", () => {
  it("finds the full component set", () => {
    expect(catalog.components.length).toBeGreaterThan(70)
    const names = catalog.components.map((component) => component.name)
    for (const expected of ["Button", "DatePicker", "ListView", "Stepper", "AiLabel"]) {
      expect(names).toContain(expected)
    }
  })

  it("extracts exports, source, and examples", () => {
    const button = catalog.components.find((c) => c.name === "Button")
    expect(button?.exports).toContain("buttonVariants")
    expect(button?.source).toContain("cva(")
    expect(button?.examples).toContain("Meta<typeof Button>")
  })

  it("marks deprecated components", () => {
    const navbar = catalog.components.find((c) => c.file === "navbar")
    expect(navbar?.deprecated).toBe(true)
  })

  it("parses light and dark token values", () => {
    const primary = catalog.tokens.find((token) => token.name === "primary")
    expect(primary?.light).toBeTruthy()
    expect(primary?.dark).toBeTruthy()
    expect(primary?.light).not.toBe(primary?.dark)
  })

  it("collects guidelines, recipes, and utilities", () => {
    expect(Object.keys(catalog.guidelines)).toContain("design-standards")
    expect(Object.keys(catalog.recipes)).toContain("rich-table")
    expect(catalog.utilities.map((u) => u.name)).toContain("date")
  })

  it("covers the charts package", () => {
    expect(catalog.packages.map((pkg) => pkg.name)).toContain(
      "@nhic/currantui-charts"
    )
    const bar = catalog.components.find((c) => c.name === "BarChart")
    expect(bar?.package).toBe("@nhic/currantui-charts")
    expect(bar?.importPath).toBe("@nhic/currantui-charts/components/bar-chart")
    expect(bar?.category).toBe("Charts")
    expect(Object.keys(catalog.guidelines)).toContain("charts")
    expect(catalog.utilities.map((u) => u.name)).toContain("use-echart")
  })
})

describe("tools", () => {
  it("lists components with category filter", async () => {
    const all = await callJson("list_components")
    expect(all.count).toBe(catalog.components.length)
    const forms = await callJson("list_components", { category: "Forms" })
    expect(forms.count).toBeLessThan(catalog.components.length)
    expect(
      (forms.components as Array<{ category: string }>).every(
        (component) => component.category === "Forms"
      )
    ).toBe(true)
  })

  it("searches by keywords", async () => {
    const result = await callJson("search_components", {
      query: "bulk selection actions",
    })
    const names = (result.matches as Array<{ name: string }>).map((m) => m.name)
    expect(names).toContain("ActionBar")

    const charts = await callJson("search_components", { query: "bar chart" })
    const chartNames = (charts.matches as Array<{ name: string }>).map(
      (m) => m.name
    )
    expect(chartNames).toContain("BarChart")
  })

  it("returns full component detail with import statement", async () => {
    const result = await callJson("get_component", { name: "date-picker" })
    expect(result.importPath).toBe("@nhic/currantui/components/date-picker")
    expect(result.import).toContain("DatePicker")
    expect(result.source).toContain("DatePicker")
  })

  it("falls back to utilities in get_component", async () => {
    const result = await callJson("get_component", { name: "date" })
    expect(result.importPath).toBe("@nhic/currantui/lib/date")
  })

  it("returns story source as examples", async () => {
    const examples = await callText("get_component_examples", {
      name: "ActionBar",
    })
    expect(examples).toContain("onClearSelection")
  })

  it("serves tokens, guidelines, and recipes", async () => {
    const tokens = await callJson("get_design_tokens", { filter: "success" })
    expect((tokens.tokens as Array<unknown>).length).toBeGreaterThan(0)

    const topics = await callJson("get_guidelines")
    expect(Object.keys(topics.topics as Record<string, string>)).toContain(
      "typography"
    )
    const page = await callText("get_guidelines", { topic: "design-standards" })
    expect(page.length).toBeGreaterThan(500)

    const recipe = await callText("get_recipe", { name: "rich-table" })
    expect(recipe).toContain("Table")
  })

  it("gives a helpful error for unknown names", async () => {
    const result = await callJson("get_component", { name: "NoSuchThing" })
    expect(result.error).toContain("NoSuchThing")
  })
})
