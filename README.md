# Folio

Folio is a macOS-first Markdown document editor built with Electron, React, CodeMirror, and Paged.js. Markdown stays the source of truth while a separate branded template controls presentation.

The first MVP includes:

- Open, edit, and save local `.md` files.
- Optional YAML front matter for SOW metadata.
- Live A4 page layout with realistic page boundaries.
- Seven bundled document themes, including a scientific preset for equations, with per-document color and typography overrides.
- Theme-aware Mermaid diagrams in preview and PDF output.
- PDF export through the same paginated component and stylesheet used by the preview.
- Native macOS window chrome, menus, keyboard shortcuts, and edited-document indicator.
- A welcome screen, recent documents, save/discard prompts, and recovery of unsaved drafts.
- A document inspector for issues and revision comparison.

## Run locally

Requirements: macOS and Node.js 20 or newer.

```bash
pnpm install
pnpm dev
```

The Vite server and Electron application start together. Use `⌘O` to open Markdown, `⌘S` to save, and `⇧⌘E` to export a PDF.

## Build and verify

```bash
pnpm check
pnpm build
pnpm start
```

`pnpm build` creates the renderer in `dist/` and the Electron main/preload bundles in `dist-electron/`. This MVP does not yet package or sign a distributable `.app`.

The theme and language selectors write their choices into the Markdown front matter. Unsaved edits are kept as a local recovery draft and offered for restoration at the next launch.

## Editing tools

Use the toolbar above the Markdown editor for headings, emphasis, links, lists, quotes, code, and tables. **Find** opens search and replace (`⌘F`). **Outline** lists document headings and jumps to the selected section. **123** toggles line numbers, and **Fold** toggles folding markers; these view choices are remembered locally. Issues with a known line appear in the editor gutter and can still be reviewed in the inspector.

## Document metadata

Front matter is optional. Without it, Folio infers the title from the first `#` heading and supplies neutral defaults.

```yaml
---
title: Northstar Brand Platform
client: Northstar Labs
prepared-for: Maya Chen, VP Marketing
prepared-by: Fieldwork Studio
date: September 18, 2026
valid-until: October 18, 2026
document-id: SOW-026
---
```

## Mermaid diagrams

Use a fenced `mermaid` block anywhere in the Markdown body. Folio renders it with the bundled SOW colors and typography before pagination, so the preview and PDF stay aligned.

````markdown
```mermaid
flowchart LR
  A[Discover] --> B[Define] --> C[Design] --> D[Launch]
```
````

## LaTeX equations

Use `$...$` or `\(...\)` for inline math. Put `$$...$$` or `\[...\]` on their own lines for display equations. A fenced `math` block also works. The editor's **Math** and **Equation** buttons insert editable examples. Equations render in the preview and PDF using bundled KaTeX fonts.

````markdown
The energy is $E = mc^2$.

$$
\frac{\partial f}{\partial x} = 2x
$$
````

Escape a dollar sign as `\$` when it could be mistaken for a math delimiter. LaTeX support is for equations inside Markdown documents; it does not import complete `.tex` files.

## Packaging & Distribution

Folio uses `electron-builder` to package native macOS releases (DMG & ZIP for Apple Silicon and Intel):

```bash
# Build macOS distributables locally into dist-packaged/
pnpm dist:mac

# Unpackaged directory build for inspection
pnpm dist:dir
```

- **Auto-Updates**: Integrated via `electron-updater` checking GitHub Releases (`carlosrivera/folio`). Checks can be triggered manually from **Folio > Check for Updates…** or run quietly on startup.
- **GitHub Actions Release**: Tag pushes (`v*`) automatically trigger `.github/workflows/release-app.yml` to compile and publish macOS releases.

## Landing Page

The marketing and documentation landing page is built with [Astro](https://astro.build) under `landing/`:

```bash
pnpm landing:dev      # Run Astro dev server locally
pnpm landing:build    # Build static site to landing/dist/
pnpm landing:preview  # Preview production build
```

Merged commits on `main` automatically deploy the landing site to GitHub Pages via `.github/workflows/deploy-pages.yml`.

