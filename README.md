# Traveling Library

Import references embedded in an EndNote-cited Word document into the collection selected in Zotero. EndNote itself and an EndNote `.enl` library are not required when the document contains its traveling-library metadata.

**Version 0.1.0 — experimental.** Targets Zotero 7 and 8 desktop. Parsing and matching have automated tests; installation, native translation and database writes still require verification in a running Zotero client. The compatibility range in the manifest permits installation; it is not a claim that every platform/version has been tested.

## Download and install

[Download traveling-library-0.1.0.xpi](https://github.com/arunviswanathan91/traveling-library/raw/refs/heads/main/dist/traveling-library-0.1.0.xpi)

1. Save the `.xpi` file. Do not unzip it.
2. In Zotero, open **Tools → Plugins** (called **Add-ons** in some versions).
3. From the gear menu, choose **Install Plugin From File…** and select the XPI.
4. Select your destination **collection** in Zotero's left pane. Create one first if necessary.
5. Use **Tools → Import EndNote references from Word…**. Zotero 8 also exposes this action in the collection context menu; select the intended collection before invoking it.
6. Choose the saved `.docx`, review the destination and references, then click **Import selected references**.

The plugin operates inside the currently running Zotero desktop application. No API key, cloud account or Word add-in is required. Save edits in Word first; the plugin reads the file on disk, not unsaved changes in an open Word window.

## What it does

- Reads Base64 `w:fldData` and inline EndNote XML associated with `ADDIN EN.CITE` / `EN.CITE.DATA` fields.
- Scans the main document, footnotes, endnotes, headers and footers; excludes fields in tracked deletions and moved-from text.
- Collapses repeated embedded records using the EndNote source-library identifier plus record number. Different libraries may reuse the same record numbers.
- Uses Zotero's installed **Endnote XML** translator to map reference types and metadata. The translator runs without saving first.
- Shows titles, authors, years, DOI values, destination and proposed actions before writing anything.
- Reuses a single exact normalized DOI match in the destination **library**, or a retained source marker from an earlier import. It adds collection membership without overwriting the existing item's metadata.
- Flags multiple existing matches for resolution. It never automatically merges on title alone. Distinct source records with the same DOI are preserved on first import, since the shared DOI could be a source error.
- Creates new items and collection memberships within one Zotero database transaction.
- Preserves translator-generated notes for metadata without a standard Zotero field. By default, each new item also gets an escaped original-metadata note, including differing embedded versions of a source record.
- Uses only local files and Zotero's local APIs. No network requests are made by this plugin. Zotero's own configured synchronization may subsequently sync imported items and notes.

## Scope and limits

**Importing references and converting a manuscript's live citation fields are separate operations.** This version imports the references. It does **not** replace EndNote fields with Zotero fields, renumber citations, regenerate the bibliography, or modify the Word file. Live document conversion is a future feature requiring a mapping from every citation cluster to the imported Zotero items and validation of locators, prefixes, suffixes and citation formatting.

Only metadata actually embedded in the document can be recovered. Abstracts, notes, keywords and other fields may be absent. PDF URLs and file paths are not PDF attachments: this version does not fetch or attach them. The original-metadata note retains the references to such files.

Supported input: unencrypted `.docx` files with intact EndNote fields. Legacy `.doc`, flattened/plain-text citations, password-protected documents and undocumented binary field variants are not supported. Simple fields are handled only when they contain inline EndNote XML. Documents with malformed payloads, missing field data or contradictory source identities are stopped for review instead of silently importing an incomplete set.

Read-only group collections are rejected. Select a collection, not My Library, a saved search, Trash or a feed. A 200 MB file / 128 MB total relevant XML limit prevents unexpectedly large document payloads.

## Development

Requires Node.js 20+ and Python 3. No runtime npm dependencies are bundled in the plugin.

```sh
npm ci
npm test
npm run build
```

The deterministic build writes `dist/traveling-library-0.1.0.xpi` and `dist/SHA256SUMS`. Only files under `src/` enter the XPI. Tests use synthetic records. Manuscripts, recovered references, local paths and user libraries must never be committed.

- `src/core.js`: XML extraction and duplicate planning, independent of Zotero.
- `src/bootstrap.js`: plugin lifecycle, DOCX ZIP reading, native translation and transactional import.
- `src/review.*`: reference preview dialog.
- `tests/`: synthetic regression tests.
- `scripts/build.py`: reproducible XPI packaging.

### Desktop acceptance checks

Before treating this as production-ready, test in a separate Zotero profile:

- Install and enable/disable on Zotero 7 and 8; confirm menu cleanup.
- Import the synthetic DOCX generated with `python3 scripts/make_fixture.py` into an empty collection.
- Check title, authors, year, DOI, keywords and source note.
- Repeat import: reuse the item without adding another reference.
- Import into a second collection in the same library: reuse the original item.
- Test ambiguous DOI matches, cancellation and a read-only group library.
- Verify source-file bytes remain unchanged and a failed save rolls back the import.

## References

- [Zotero JavaScript API](https://www.zotero.org/support/dev/client_coding/javascript_api)
- [Zotero 7 plugin development](https://www.zotero.org/support/dev/zotero_7_for_developers)
- [Zotero 8 plugin development](https://www.zotero.org/support/dev/zotero_8_for_developers)
- [Zotero's Endnote XML translator](https://github.com/zotero/translators/blob/master/Endnote%20XML.js)

This is an independent community plugin, not an official Zotero or EndNote product.
