# Model Context Protocol (MCP) Integration

Folio exposes 12 local tools for discovering document presets, creating and updating Markdown, checking it, exporting PDFs, and managing named styles inside existing `.folio` files.

This guide describes the current source. Check the [changelog](https://carlosrivera.github.io/folio/changelog/) for release availability; the reusable style tools are listed under **Next release**.

## Connect a client

The server uses standard input/output (`stdio`). With Folio installed in `/Applications`, add this server to your client's local MCP configuration:

```json
{
  "mcpServers": {
    "folio": {
      "command": "/Applications/Folio.app/Contents/MacOS/Folio",
      "args": ["--mcp"]
    }
  }
}
```

The installed app supplies the runtime; no repository clone or separate Node.js installation is needed. Restart or reconnect the client after saving its configuration.

If you prefer `folio --mcp`, create a shortcut once:

```bash
sudo ln -sf /Applications/Folio.app/Contents/MacOS/Folio /usr/local/bin/folio
```

Then use `"command": "folio"` with `"args": ["--mcp"]`.

For development, install dependencies in the repository and run `pnpm mcp` from its root. A client configured with `"command": "pnpm"` and `"args": ["mcp"]` must use the repository as its working directory. Run `pnpm build` before PDF export so the renderer and Electron bundles are available.

## Document types and themes

Folio includes 10 built-in presets:

| ID | Purpose | Layout |
| --- | --- | --- |
| `report` | Report or statement of work with a cover and optional contents. | `report` |
| `invoice` | Invoice with issuer/client metadata and supplied totals. | `invoice` |
| `simple` | Document without a cover, with configurable headers and footers. | `simple` |
| `cv` | Curriculum vitae with contact details and a compact timeline. | `cv` |
| `scientific-paper` | Research manuscript with authors, affiliations, abstract, and keywords. | `scientific` |
| `whitepaper` | Technical white paper with a cover. | `report` |
| `tech-spec` | Engineering specification with technical sections. | `report` |
| `contract` | Agreement with terms and signature sections. | `report` |
| `meeting-notes` | Structured meeting notes. | `simple` |
| `receipt` | Payment receipt. | `invoice` |

The supported base layouts are `report`, `simple`, `invoice`, `cv`, and `scientific`. Themes are independent: `editorial`, `voltage`, `graphite`, `contrast`, `slate`, `nocturne`, and `scientific`.

Landscape Presentation and Petstore API Documentation are desktop starters/samples, not additional built-in MCP preset IDs. Set `metadata.orientation` to `"landscape"` when creating a wide document. For scientific articles, supply `authors`, `affiliations`, `abstract`, `keywords`, `journal`, and `doi` through `metadata` as needed.

Interface language belongs to app Settings. New document and preset tools do not accept `lang` or `defaultLang`.

## Document tools

### `folio_list_document_types`

Takes no inputs. Returns built-in and workspace presets with `id`, `name`, `description`, `baseLayout`, `defaultTheme`, optional `kicker`, and `isCustom`.

### `folio_get_document_type`

- `typeId` (required string): a preset ID, such as `scientific-paper` or `invoice`.

Returns the preset, its metadata fields and starter template, supported placeholders, available themes, and editable theme tokens.

### `folio_register_document_type`

- Required: `id`, `name`, `description`, and `baseLayout`.
- Optional: `defaultTheme`, `kicker`, `header`, `footer`, `themeOverrides`, `fields`, and `starterTemplate`.
- `header` and `footer` accept `left`, `center`, and `right` strings.
- Each `fields` entry has `name`, `description`, and optional `required` and `default` values.

Stores the preset in `.folio/presets/<id>.json` under the server's working directory. Custom preset IDs use letters, numbers, underscores, and dashes. Future discovery calls include these workspace presets.

### `folio_create_document`

- `title` and `content` (required strings): document title and Markdown body. Pass `content: ""` to use the preset's starter template.
- `type` (optional string, defaults to `report`): built-in or workspace preset ID.
- `theme` (optional theme name).
- `metadata` (optional object): frontmatter keys, such as `client`, `prepared-by`, `orientation`, or `authors`.
- `themeOverrides` (optional string map): recognized font/color tokens.
- `outputPath` (optional string): destination `.md` path.

Returns `success`, `markdown`, `presetUsed`, `lint`, and optional `outputPath`. Without `outputPath`, it returns Markdown without saving a file. This tool creates Markdown; save it as a `.folio` document in the app before using the portable style tools.

### `folio_customize_document`

- Supply `source` (Markdown string) or `filePath` (existing Markdown file).
- Optional: `setLayout`, `setTheme`, `setMetadata`, `setThemeOverrides`, `setHeader`, `setFooter`, and `outputPath`.
- `setHeader` and `setFooter` accept `left`, `center`, and `right` strings.
- Set a `setMetadata` value to `null` to remove that key.

Returns updated `markdown` and `lint`. It writes only when `outputPath` is supplied; to overwrite the input file, pass the same path for `filePath` and `outputPath`. Metadata updates may rewrite YAML formatting and comments.

### `folio_lint_document`

Supply `source` or `filePath`. Returns `valid`, `errorCount`, `warningCount`, `infoCount`, and `findings` with rule names, severity, messages, and one-based line numbers when available.

Checks include unclosed code fences, unmatched landscape markers, missing local heading anchors, duplicate anchors, heading-level jumps, table structure, and frontmatter guidance. Review rendered math and diagrams in the preview as well.

### `folio_export_pdf`

- Supply `inputPath` (Markdown file) or `source` (Markdown string).
- `outputPath` (required string): destination PDF path.
- Optional: `theme` and `lang` (`en` or `es`, an export-label override).

Exports through the headless Electron renderer. Orientation follows the document's frontmatter; portrait and landscape are supported. Returns `success`, `path`, `pageCount`, `sizeBytes`, and `title`. This tool reads Markdown, so export a styled `.folio` document in the app, or pass the Markdown returned by `folio_apply_style` as `source`.

## Portable style tools

All five tools take a required `filePath` pointing to an existing `.folio` document. Named styles and the active style live in its `styles.json`, including saved revision snapshots.

| Tool | Additional inputs | Behavior |
| --- | --- | --- |
| `folio_list_styles` | None. | Returns named styles, the current theme, active style, font choices, and editable tokens. |
| `folio_create_style` | Required `name`, `theme`; optional `overrides`. | Creates a named style without applying it. |
| `folio_duplicate_style` | Optional `styleId`, `name`. | Copies a named style, or the current document appearance when `styleId` is omitted. |
| `folio_update_style` | Required `styleId`; optional `name`, `theme`, `overrides`. | Updates the library entry without applying it. `overrides` replaces the complete override map. |
| `folio_apply_style` | Required `styleId`. | Applies the style, sets the active style, and returns updated Markdown, styles, and history. |

Discover style IDs and valid tokens with `folio_list_styles`. Mutations preserve attachments and add a restorable saved revision when something changes. Older `.folio` files without a named library remain supported. An open document uses the app's external-change/reload flow after an MCP mutation.

## Example: create, check, and export an article

These are tool arguments; invoke them in order through your MCP client. The destination directory must already exist.

1. Inspect the article preset with `folio_get_document_type`:

```json
{ "typeId": "scientific-paper" }
```

2. Call `folio_create_document`:

```json
{
  "type": "scientific-paper",
  "title": "Reproducible State Estimation",
  "metadata": {
    "authors": ["Alex Rivera", "Sam Chen"],
    "affiliations": ["Example Research Lab"],
    "abstract": "A comparison of two state-estimation methods.",
    "keywords": ["estimation", "reproducibility"],
    "orientation": "portrait"
  },
  "content": "## 1. Introduction\n\nResearch question and contribution.\n\n## 2. Methods\n\nDescribe the procedure.\n",
  "outputPath": "./article.md"
}
```

3. Call `folio_lint_document`:

```json
{ "filePath": "./article.md" }
```

4. Call `folio_export_pdf`:

```json
{ "inputPath": "./article.md", "outputPath": "./article.pdf" }
```

## Example: apply a document's saved style

Save the document as `report.folio` in the app, then call `folio_list_styles`:

```json
{ "filePath": "./report.folio" }
```

Choose an actual returned style ID and call `folio_apply_style` with that `styleId` and the same `filePath`. Lint the returned `markdown` by passing it as `source`, and pass that same Markdown as `source` to `folio_export_pdf`. To create a landscape document, include `"orientation": "landscape"` in `metadata`, or in `setMetadata` when customizing its Markdown.
