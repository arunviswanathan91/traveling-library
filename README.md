# Traveling Library

Import references embedded in an EndNote-cited Word document into the collection selected in Zotero. EndNote itself and an EndNote `.enl` library are not required when the document contains its traveling-library metadata.

**Version 0.3.0 — experimental.** Targets Zotero 7 through 10 desktop. Parsing and matching have automated tests; installation, native translation and database writes still require verification in a running Zotero client. The compatibility range in the manifest permits installation; it is not a claim that every platform/version has been tested.

## Download and install

[Download traveling-library-0.3.0.xpi](https://github.com/arunviswanathan91/traveling-library/raw/refs/heads/main/dist/traveling-library-0.3.0.xpi)

1. Save the `.xpi` file. Do not unzip it.
2. In Zotero, open **Tools → Plugins** (called **Add-ons** in some versions).
3. From the gear menu, choose **Install Plugin From File…** and select the XPI.
4. Select your destination **collection** in Zotero's left pane. Create one first if necessary.
5. Use **Tools → Import EndNote references from Word…**. Zotero 8 and later also exposes this action in the collection context menu; select the intended collection before invoking it.
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
- Reference extraction uses local files and Zotero's local APIs. Optional DOI verification sends identifiers to NCBI and Zotero's metadata providers. It does not upload your manuscript. Reference extraction itself makes no network requests. Zotero can check the public GitHub update manifest and download plugin updates; document contents are never included in those requests. Zotero's own configured synchronization may subsequently sync imported items and notes.

## Scope and limits

**Importing references and converting a manuscript's live citation fields are separate operations.** Import leaves the Word file unchanged. Version 0.3.0 adds a separate **Convert EndNote citations to Zotero…** command that creates a new DOCX; see the workflow and limitations below. Zotero's Word add-in is required to refresh and edit the converted citations.

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

The deterministic build writes `dist/traveling-library-0.3.0.xpi` and `dist/SHA256SUMS`. Only files under `src/` enter the XPI. Tests use synthetic records. Manuscripts, recovered references, local paths and user libraries must never be committed.

- `src/core.js`: XML extraction and duplicate planning, independent of Zotero.
- `src/bootstrap.js`: plugin lifecycle, DOCX ZIP reading, native translation and transactional import.
- `src/review.*`: reference preview dialog.
- `tests/`: synthetic regression tests.
- `scripts/build.py`: reproducible XPI packaging.

### Desktop acceptance checks

Before treating this as production-ready, test in a separate Zotero profile:

- Install and enable/disable on Zotero 7 through 10; confirm menu cleanup.
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

## 0.1.1 installation fix

The 0.1.0 package omitted the mandatory `applications.zotero.update_url` and limited compatibility to Zotero 8. Version 0.1.1 supplies a hosted update manifest with a SHA-256 build hash and permits Zotero versions through 10.0.x, including 10.0.6. It also loads the Fluent resource needed by the Zotero 8+ menu API. Manifest checks now cover these requirements. Zotero 10 API signatures were checked against current upstream source; an actual desktop installation has not been exercised in this build environment.

## Verification and PubMed enrichment

In the import preview, enable **Verify and enrich references using DOI after import**. **Prefer PubMed metadata** is selected by default and can be disabled. Import completes first, then a separate verification window opens. Existing imports remain available if verification fails or is stopped.

For previously imported references, select items and choose **Tools → Verify selected references by PMID / DOI…**, or the same command in the item context menu (Zotero 8+).

- **Verify reference** checks one reference; **Verify all / retry unfinished** checks references sequentially.
- With PubMed enabled, a known PMID is fetched directly as PubMed XML and read by Zotero's import translator. Otherwise an exact DOI search obtains a PMID, with native DOI lookup as fallback. A direct PMID fetch failure is shown for retry.
- A matching normalized title, DOI, reference type and (when present) first author permits **missing fields only** to be filled automatically. This conservative check flags substantive or ambiguous differences for review; it is not proof of scientific accuracy.
- **Review changes** shows current/retrieved values. Explicitly check fields and choose **Apply checked changes** to replace existing values. Edits made to an item since lookup are detected and require reverification.
- PMID and PMCID use native fields where supported, otherwise Extra without removing the source marker or custom Extra content. Notes, attachments, collection membership and the Zotero item key are retained.
- Lookup is sequential with pauses, timeouts, stop and retry controls. Stopping finishes the current check; closing discards pending lookup results. Providers can still rate-limit requests shared with other applications on the same IP.
- Only fields returned by Zotero's translator can be imported. PubMed coverage, abstracts and complete author lists are not guaranteed. This is bibliographic enrichment, not full-text/PDF retrieval. References without a usable DOI or PMID are flagged; automatic title search is not implemented.

Automated tests cover comparison, fallback, conflicting identities and concurrent edits using mocked Zotero APIs. Native desktop dialogs, translation and database integration still require real Zotero testing.


### 0.2.1 — embedded identifiers and direct PubMed lookup

New imports extract PMID from a recognized PubMed URL, cross-check a numeric accession number when present, and extract only the `PMC` number from mixed EndNote custom2 text. Zotero 10 native PMID/PMCID fields are supported; older versions use Extra. Other source metadata remains preserved in the optional Original EndNote metadata note, including affiliations and disclosure text that do not map to standard bibliographic fields.

For references already imported, select them and run **Verify selected references by PMID / DOI** with **Prefer PubMed** enabled. Verification recovers missing identifiers from saved Original EndNote metadata notes or the item URL. It then fetches PubMed XML directly by PMID and uses Zotero's PubMed XML import translator, avoiding search-translator discovery. If no source note, URL or PMID was retained, DOI lookup is still available. PMCID is retained and compared but is not independently used to search for articles in this version.

Lookup status shows the current stage and elapsed seconds. HTTP stages time out after 15 seconds, PubMed translation after 15 seconds, and DOI translation after 20 seconds. Timers now run in the verification dialog rather than its modal parent. A failed direct PMID lookup displays an error for retry, without silently adding another DOI lookup. Missing fields are filled only when identifier, title, author and reference type checks agree; existing values require review. No extra plugin is required. Windows Zotero desktop execution remains to be confirmed by user testing.


### 0.2.2 — metadata coverage audit and offline recovery

New imports always include a readable **EndNote source metadata — readable copy** child note. It lists every nonempty source field with its original path, including affiliations, all URLs and attachment paths, custom-field remainders, research notes, alternative titles, dates, source identifiers, and unknown fields. Source variants are combined without discarding differing values. The separate raw XML note remains optional.

- Related/web/text URLs supply the item URL; local paths and PDF links remain source-note text.
- Journal ISSNs are extracted from EndNote's ISBN field, stripped of Electronic/Print/Linking labels and deduplicated. Original labels remain in the source note.
- Missing abstracts, short titles, explicit journal abbreviations, language, library catalog and call numbers receive source values. The native EndNote translator continues to handle authors, publication dates, volume/issue/pages, publishers, tags and type-specific mappings.
- An abbreviated-looking journal title is not assumed to be an explicit abbreviation. A date in the edition field is not assumed to be publication date. Keyword fragments and custom disclosure text remain recoverable without guessing their intended meaning.

For **already imported references**, select them and choose **Tools → Recover embedded metadata for selected references…**. This is offline. It reads retained Original EndNote metadata notes, fills missing supported fields and identifiers, and adds a readable source note once. Existing nonempty fields and tags are unchanged, so existing labeled ISSNs are not silently rewritten. References without saved source notes cannot recover absent metadata through this command; their retained URL can still yield a PMID. Online verification also runs this recovery step first.

These changes have automated parser, mapping, timeout, comparison, mocked-import and recovery tests. Actual Zotero desktop execution is still unverified here.


## 0.3.0 — convert existing EndNote Word fields

1. Import the DOCX references into Zotero first. Select a collection in that same library.
2. Save and close the source document in Word.
3. In Zotero 8–10, choose **Tools → Convert EndNote citations to Zotero…** and select the saved DOCX.
4. Preflight must match every citation to exactly one Zotero item. Matching uses the retained source identifier, or an exact DOI plus matching normalized title. It searches the selected collection's library.
5. Choose an installed in-text CSL style with a bibliography, then **Save converted copy…**. Choose a new filename; existing files cannot be overwritten.
6. Open the copy in desktop Word with Zotero running. Click **Zotero → Refresh**, then test **Add/Edit Citation** on a converted citation. Use **Document Preferences** to change styles. If no EndNote bibliography field existed, insert one with **Add/Edit Bibliography**.

The new DOCX contains Zotero ITEM/CSL_CITATION fields with real item URIs and embedded CSL data, a Zotero bibliography field when present, and Zotero document preferences. Citation groups, item order, prefix/suffix spaces, page locators and the observed EndNote `ExcludeAuth="1"` setting are retained. Existing visible field results and run formatting remain until Zotero Refresh regenerates them; the bibliography is then generated from cited items and the chosen Zotero style. Manual bibliography edits, EndNote style-specific formatting and uncited bibliography entries are not carried into Zotero's generated bibliography. Other ZIP entries are copied from the original document.

This is an experimental converter with explicit boundaries: standard transitional DOCX complex fields, in-text styles, and citations in the body/footnotes/endnotes. It stops before saving for missing/ambiguous items, unsupported citation settings (including exclude-year/narrative modes), conflicting payloads, tracked citation revisions, content-control/text-box citations, header/footer citations, simple fields, mixed Zotero/EndNote fields, multiple bibliographies, nonstandard custom-property targets or signed packages. It does not run EndNote or Word automation, does not modify the Zotero library, and does not overwrite the original DOCX.

Automated tests validate field JSON, grouped citations, nested DATA removal, preserved text/formatting, matching failures, author suppression, locators, bibliography fields and package preferences. Windows Word Refresh/Add/Edit Citation and Zotero runtime ZIP writing still require desktop verification; successful XML checks alone do not establish that end-to-end behavior.
