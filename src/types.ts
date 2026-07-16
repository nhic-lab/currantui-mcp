export interface ComponentEntry {
  /** Primary export name, e.g. "SelectBoxGroup" */
  name: string
  /** File base name, e.g. "select-box-group" */
  file: string
  /** npm package the component ships in, e.g. "@nhic/currantui-charts" */
  package: string
  /** e.g. "@nhic/currantui/components/select-box-group" */
  importPath: string
  /** Storybook grouping, e.g. "Forms", "Charts", or "Components" */
  category: string
  description: string
  exports: Array<string>
  deprecated: boolean
  source: string
  /** Co-located stories file source (usage examples), if any */
  examples: string | null
}

export interface TokenEntry {
  /** CSS variable name without the -- prefix */
  name: string
  light: string | null
  dark: string | null
}

export interface UtilityEntry {
  name: string
  package: string
  importPath: string
  source: string
}

export interface GuidelinePage {
  title: string
  content: string
}

export interface Catalog {
  /** Version of @nhic/currantui the catalog was extracted from */
  version: string
  /** Every npm package covered by the catalog */
  packages: Array<{ name: string; version: string }>

  components: Array<ComponentEntry>
  tokens: Array<TokenEntry>
  guidelines: Record<string, GuidelinePage>
  recipes: Record<string, string>
  utilities: Array<UtilityEntry>
}
