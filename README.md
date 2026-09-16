# BundleBridge — Properties Resource Bundle Editor

Edit Java `.properties` translation bundles in VS Code and Cursor: one tab per bundle, a searchable key tree, per-locale fields, and configurable save formatting. Implemented in JavaScript with no runtime dependencies.

## Install and open

1. Install from the VS Code Marketplace, or run **Extensions: Install from VSIX…** and select `bundlebridge-0.1.0.vsix`.
2. Right-click any `.properties` file in Explorer and choose **BundleBridge: Open Bundle Editor**. The same command is available from the Command Palette and editor title menu.
3. To start a new bundle, right-click a folder (or an existing `.properties` file in that folder) and choose **BundleBridge: New Bundle…**. Enter the base name; the extension creates empty files for every locale already used in that folder (for example `Messages_en_US.properties` and `Messages_es_MX.properties` when sibling bundles use `en_US` and `es_MX`), then opens the bundle editor.
4. Select a key in the left tree. Edit translations on the right, then choose **Save bundle** or press **Cmd+S / Ctrl+S** while the bundle editor is focused.

The extension opens one tab for each folder + bundle name. Opening another locale from that bundle returns to the existing tab. `Content.properties`, `Content_en_US.properties`, and `Content_es_MX.properties` belong together. Language-only and script locales such as `Content_fr.properties` and `Content_zh_Hant_TW.properties` are supported. Unknown codes such as `ex_MX` still group correctly. Locale-like suffixes in ordinary filenames are inherently ambiguous; the extension interprets matching suffixes as locales.

## Editing

- Expandable tree based on dot-separated keys (separator configurable).
- Search both keys and translation values. Filter missing or empty translations.
- Add a key to every locale, duplicate all translations, rename across locales, copy the key name, or delete with confirmation.
- **Add locale…** duplicates an existing locale file into a new one. Choose the source file, then enter the language subtag and optional script, region, and variant (for example `fr`, or `zh` + `Hant` + `TW` for `Content_zh_Hant_TW.properties`).
- Base keys that also have child keys remain individually editable.
- Missing entries stay absent until edited. Clearing an entry writes an empty value by default.
- Open any locale's source file using **Open source**.
- Drafts persist in the editor's workspace storage when the bundle tab closes. Reopen the bundle to resume. **Discard draft** reloads source files.
- Saving applies edits through VS Code text documents, then saves each file. Source-editor undo is available. The bundle's input fields use normal text undo; there is no bundle-wide operation history.
- If source content or locale membership changes after editing begins, saving is blocked and the draft is retained. Copy needed draft values, discard the draft, and reconcile with the latest source files.
- Files are saved individually; this is not a disk-level transaction. Failed saves remain as unsaved changes in native source documents.

## Formatting

Adjust formatting with **BundleBridge: Open Settings** in the Command Palette (works with or without a bundle tab open), **Settings…** in the bundle toolbar (opens settings focused on locale order), or search for **BundleBridge** under Extensions in the editor Settings UI. **Save bundle** formats the bundle when applying a draft; **Format files** explicitly formats all locale files even without edits.

Unless noted, examples assume defaults (`unicodeEscape: true`, delimiter `=` with spaces, no sort/align/wrap). Each example shows source entries, then the file after **Format files** with only the listed setting(s) changed.

### Locale order

**Settings…** in the bundle toolbar opens formatting settings and focuses locale order for your current context:

- **Workspace Locale Order** (`bundleBridge.workspaceLocaleOrder`) when a workspace folder is open
- **User Locale Order** (`bundleBridge.userLocaleOrder`) when no workspace is open

These lists are independent; the extension does not merge, copy, or fall back between them. Locales you remove stay removed (opening a bundle does not rewrite the list). New locales are appended to the workspace list only when you create them with **Add locale…** or **New Bundle…**. Locales not in the list still appear after the ordered ones. Use `""` in the list for the base `.properties` file (no locale suffix).

**Example — translation panel column order**

Workspace locale order: `de_DE`, `es_MX`, `en_US`

Files on disk (any order): `Messages_en_US.properties`, `Messages_de_DE.properties`, `Messages_es_MX.properties`

Panels in the bundle editor: **de_DE** → **es_MX** → **en_US**

### Save & encoding

#### `bundleBridge.unicodeEscape` (default: `true`)

Non-ASCII characters in keys and values are written as Java `\uXXXX` escapes when enabled; when disabled, UTF-8 characters are written literally (VS Code still saves as UTF-8).

Source:

```properties
greeting=Hello café
emoji=😀
```

With `unicodeEscape: true`:

```properties
greeting = Hello caf\u00E9
emoji = \uD83D\uDE00
```

With `unicodeEscape: false`:

```properties
greeting = Hello café
emoji = 😀
```

#### `bundleBridge.uppercaseHex` (default: `true`)

Applies only when `unicodeEscape` is on. Controls letter case in `\u` sequences.

With `uppercaseHex: true`: `\u00E9`, `\uD83D\uDE00`

With `uppercaseHex: false`: `\u00e9`, `\ud83d\ude00`

#### `bundleBridge.keepEmptyValues` (default: `true`)

Source:

```properties
title=Welcome
subtitle=
footer=Bye
```

With `keepEmptyValues: true`:

```properties
title = Welcome
subtitle =
footer = Bye
```

With `keepEmptyValues: false` (empty entry removed):

```properties
title = Welcome
footer = Bye
```

#### `bundleBridge.generatedHeader` (default: `false`)

When enabled, adds a marker line at the top of the file if it is not already present (existing file headers are kept below it).

With `generatedHeader: true`:

```properties
# Generated by BundleBridge
title = Welcome
```

### Layout

#### `bundleBridge.delimiter` (default: `=`)

With `delimiter: "="`:

```properties
key = value
```

With `delimiter: ":"`:

```properties
key : value
```

#### `bundleBridge.spacesAroundDelimiter` (default: `true`)

With `spacesAroundDelimiter: true`:

```properties
key = value
```

With `spacesAroundDelimiter: false`:

```properties
key=value
```

#### `bundleBridge.alignment` (default: `none`)

Pads keys so delimiters line up. Works with `sortKeys` and/or `groupKeys` as needed.

Source:

```properties
a.short=1
a.longer=2
ab.other=3
```

With `alignment: "none"` (default):

```properties
a.short = 1
a.longer = 2
ab.other = 3
```

With `alignment: "file"` and `sortKeys: true`:

```properties
a.longer = 2
a.short  = 1
ab.other = 3
```

With `alignment: "group"`, `sortKeys: true`, and `groupKeys: true`:

```properties
a.longer = 2
a.short  = 1

ab.other = 3
```

#### `bundleBridge.sortKeys` (default: `false`)

Source:

```properties
z=last
a.one=1
m=middle
```

With `sortKeys: true`:

```properties
a.one = 1
m = middle
z = last
```

With `sortKeys: false`: entry order unchanged (only delimiter/spacing settings apply).

### Key groups

Grouping uses `groupSeparator` and `groupDepth`. When **Group keys** is on, blank lines between groups are controlled by `blankLinesBetweenGroups`; other blank lines in the file are removed on save/format.

#### `bundleBridge.groupKeys` (default: `false`)

With `groupKeys: true` and `sortKeys: true` (same source as alignment example):

```properties
a.longer = 2
a.short = 1

ab.other = 3
```

With `groupKeys: false`: no extra blank lines between groups (still sorted if `sortKeys` is on).

#### `bundleBridge.groupSeparator` (default: `.`)

Tree and grouping split keys on this separator. With `groupSeparator: "/"`, `groupKeys: true`, `sortKeys: true`:

Source:

```properties
a.x=1
a.y=2
b.z=3
```

Output:

```properties
a.x = 1

a.y = 2

b.z = 3
```

(Dots in keys are not group boundaries when the separator is `/`.)

#### `bundleBridge.groupDepth` (default: `1`)

Number of separator segments that define one group. With `groupDepth: 2`, `groupKeys: true`, `sortKeys: true`:

Source:

```properties
a.b.one=1
a.b.two=2
a.c=3
```

Output:

```properties
a.b.one = 1
a.b.two = 2

a.c = 3
```

(`a.b.one` and `a.b.two` share group `a.b`; `a.c` is a separate group, so one blank line appears before it.)

#### `bundleBridge.blankLinesBetweenGroups` (default: `1`)

With `blankLinesBetweenGroups: 2` (and `groupKeys: true`, `sortKeys: true`):

```properties
a.longer = 2
a.short = 1


ab.other = 3
```

### Line wrapping

Wrapping uses Java continuation lines: a trailing `\` on a line continues the value on the next line. Leading spaces on continuations are escaped so they are not trimmed.

#### `bundleBridge.wrapColumn` (default: `0`, off)

With `wrapColumn: 24`, `wrapIndent: 6`, `unicodeEscape: false`:

Source:

```properties
body=First sentence. Second sentence is long.
```

Output:

```properties
body = First sentence. \
      Second sentence i\
      s long.
```

With `wrapColumn: 0`: value stays on one line.

#### `bundleBridge.wrapIndent` (default: `8`)

Spaces at the start of each continuation line when `wrapAlign` is false. See the `wrapColumn` example (`wrapIndent: 6`).

#### `bundleBridge.wrapAlign` (default: `false`)

When true, continuation lines align under the first character of the value instead of using a fixed indent.

With `wrapColumn: 20`, `wrapAlign: true`, `unicodeEscape: false`:

```properties
greeting = Hello ca\
           fé
```

With `wrapAlign: false` and `wrapIndent: 8`:

```properties
greeting = Hello ca\
        fé
```

#### `bundleBridge.wrapAfterNewline` (default: `false`)

When true, forces a wrap break immediately after an escaped `\n` or `\r` inside a value (in addition to normal column wrapping).

Source (value contains two logical lines):

```properties
msg=Line one\nLine two is longer than the wrap column\nLine three
```

With `wrapColumn: 28`, `wrapAfterNewline: true`, `wrapIndent: 4`:

```properties
msg = Line one\n\
    Line two is longer than\
    \ the wrap column\n\
    Line three
```

### Newlines

#### `bundleBridge.valueNewline` (default: `preserve`)

Normalizes line breaks **inside** values before writing escapes. Does not change physical line endings between entries unless combined with wrapping.

Source (value is three lines joined by `\n` escapes):

```properties
msg=Line one\nLine two\nLine three
```

With `valueNewline: "preserve"`: `\n` escapes unchanged in output.

With `valueNewline: "crlf"`:

```properties
msg = Line one\r\nLine two\r\nLine three
```

(`"lf"` and `"cr"` normalize to `\n` and `\r` escapes respectively.)

#### `bundleBridge.lineEnding` (default: `preserve`)

Controls the line terminator **between** lines of the file. `"preserve"` keeps whatever the document already used.

Source:

```properties
a=1
b=2
```

With `lineEnding: "lf"`: lines end with `\n` (Unix).

With `lineEnding: "crlf"`: lines end with `\r\n` (Windows).

With `lineEnding: "cr"`: lines end with `\r` (classic Mac).

### Notes

Unicode escapes display as readable characters in the bundle editor. Parsing supports Java escaping, whitespace separators, continuations, comments, empty values, and UTF-16 surrogate escapes. File headers are retained separately, and entry comments follow their keys through renames; deleting an entry removes its attached comments. Duplicate keys and malformed Unicode escapes are reported instead of silently rewritten. File encoding is managed by VS Code's text-document settings; use `files.encoding` for legacy encodings.

## Development

Open this directory in VS Code/Cursor and press **F5** to launch an Extension Development Host with the example bundles. No build or runtime dependency installation is required.

```sh
npm test
npm run check
npm run package
```

Packaging uses `@vscode/vsce` (downloaded via `npx` if needed).

Implementation uses the [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) and [WorkspaceEdit API](https://code.visualstudio.com/api/references/vscode-api#WorkspaceEdit).

## License

BundleBridge is released under the [MIT License](LICENSE).
