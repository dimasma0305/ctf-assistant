declare module "ascii-table" {
  class AsciiTable {
    constructor(title?: string, options?: unknown);
    setHeading(...headings: string[]): this;
    addRow(...row: unknown[]): this;
    toString(): string;
  }
  export = AsciiTable;
}
