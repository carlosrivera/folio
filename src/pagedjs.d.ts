declare module 'pagedjs' {
  /** A stylesheet is either a URL or a `{ [href]: cssText }` pair. */
  export type PagedStylesheet = string | Record<string, string>

  export class Previewer {
    polisher?: { destroy(): void }
    chunker?: {
      destroy(): void
      hooks: { onOverflow: { register(callback: (overflow: Range | undefined, rendered: HTMLElement, bounds: DOMRect) => Range | null | undefined): void } }
    }
    preview(
      content: HTMLElement | string,
      stylesheets: PagedStylesheet[],
      renderTo: HTMLElement,
    ): Promise<{ total: number }>
  }
}
