declare module "solc" {
  type ImportResult = { contents?: string; error?: string }
  type ImportCallback = (path: string) => ImportResult

  const solc: {
    compile(input: string, callbacks?: { import?: ImportCallback }): string
    version(): string
  }

  export default solc
}
