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

Choose **Settings** in the bundle toolbar, or search for **BundleBridge** in the editor Settings UI. Settings can be scoped to the workspace. **Save bundle** formats the bundle when applying a draft; **Format files** explicitly formats all locale files even without edits.

### Locale order

**Locale order…** opens the locale-order setting for your current context:

- **Workspace Locale Order** (`bundleBridge.workspaceLocaleOrder`) when a workspace folder is open
- **User Locale Order** (`bundleBridge.userLocaleOrder`) when no workspace is open

These are independent; the extension does not merge, copy, or fall back between them. Example workspace order: `de_DE`, `es_MX`, `en_US`. Locales you remove from the list stay removed (opening a bundle does not rewrite the list). New locales are added to the workspace list only when you create them with **Add locale…** or **New Bundle…**. Locales not in the list still appear after the ordered ones. Use `""` for the base `.properties` file.

| Setting | Choices / behavior |
| --- | --- |
| Unicode escape | Java `\uXXXX` escaping, uppercase or lowercase hexadecimal |
| Delimiter | `=` or `:` |
| Spaces around delimiter | Enabled or disabled |
| Alignment | None, whole file, or key group |
| Sort keys | Alphabetical or existing order |
| Group keys | Group depth, key separator, blank lines between groups |
| Wrap column | Zero disables; otherwise Java continuation lines |
| Wrap indentation | Fixed spaces or align with value |
| Wrap after newline | Continue after escaped newlines |
| Value newline | Preserve, LF, CRLF, or CR within values |
| Line ending | Preserve, LF, CRLF, or CR for physical file lines |
| Keep empty values | Enabled by default; disabling removes empty entries |
| Generated header | Optional |

Unicode escapes display as readable characters in the editors. Parsing supports Java escaping, whitespace separators, continuations, comments, empty values, and UTF-16 surrogate escapes. File headers are retained separately, and entry comments follow their keys through renames; deleting an entry removes its attached comments. Duplicate keys and malformed Unicode escapes are reported instead of silently rewritten. File encoding is managed by VS Code's text-document settings; use `files.encoding` for legacy encodings.

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
# BundleBridge
