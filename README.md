# Traveling Library

A Zotero desktop plugin for importing references from EndNote-cited Word documents, recovering embedded metadata, verifying references through PubMed or DOI lookup, and converting Word citation fields between EndNote and Zotero.

**Current version: 0.4.0.** The installation manifest supports Zotero 7–10; document-conversion commands are available in Zotero 8–10. Compatibility across every desktop version and platform has not been fully tested. Both document converters are experimental.

## Install in Zotero

**[Download Traveling Library 0.4.0 (.xpi)](https://github.com/arunviswanathan91/traveling-library/raw/refs/heads/main/dist/traveling-library-0.4.0.xpi)**

1. Download and save the `.xpi` file. Do not unzip it or install it in your browser.
2. Open the **Zotero desktop application**.
3. Go to **Tools → Plugins** (**Add-ons** in some versions).
4. Click the **gear icon → Install Plugin From File…**.
5. Select `traveling-library-0.4.0.xpi` and complete installation.
6. **Fully quit and reopen Zotero.**

To update an existing installation, install the newer XPI the same way and restart Zotero. You do not need to reimport your references.

No API key or additional Zotero plugin is required. Import and offline metadata recovery do not require EndNote or Word to be installed. Editing and refreshing converted documents requires desktop Word with the relevant citation-manager add-in.

## Functionality

| Feature | What it does |
| --- | --- |
| Import EndNote references | Extracts the traveling-library records embedded in a Word DOCX and imports selected references into a Zotero collection. An original EndNote `.enl` library is not required. |
| Preserve source metadata | Maps supported bibliographic fields and creates a readable source-metadata note for affiliations, custom fields, disclosures, URLs and other embedded information. Raw XML preservation is optional. |
| Recover metadata offline | Fills missing supported fields in existing imports using their retained original-metadata notes. |
| Verify and enrich references | Uses a known PMID directly, or searches PubMed by DOI with DOI lookup as fallback. Supports individual and sequential batch verification. |
| Review metadata changes | Fills missing fields automatically only when reference checks agree; existing values and conflicting metadata require review. |
| EndNote → Zotero | Creates a separate DOCX containing Zotero citation fields linked to imported Zotero items and a Zotero bibliography field when present. |
| Zotero → EndNote | Creates a separate DOCX containing EndNote traveling-library citation records and a bibliography field when present. **Experimental.** |

## Import references from Word

1. Save your EndNote-cited document as an unencrypted `.docx`.
2. In Zotero, create or select the destination **collection**.
3. Choose **Tools → Import EndNote references from Word…**.
4. Select the DOCX and review the references and destination.
5. Click **Import selected references**.

Importing references leaves the Word document unchanged. Converting its live citation fields is a separate operation.

The importer reads embedded records from the document body, footnotes, endnotes, headers and footers. It uses retained EndNote source identifiers and exact DOI matches to identify existing items, flags ambiguous matches, and adds collection membership without overwriting existing metadata.

Supported metadata includes authors, titles, publication dates, journal details, volume, issue, pages, identifiers, URLs, keywords and other type-specific fields. PMID and PMCID are extracted where available; mixed custom-field text is retained in the source note. ISSNs are cleaned and deduplicated on new imports. Information without a standard Zotero field remains readable in a child note.

Only information actually embedded in the document can be recovered. PDF links and file paths are preserved as source information; the plugin does not download or attach PDFs.

## Verify references and retrieve PubMed metadata

In the import dialog, enable **Verify and enrich references using DOI after import** and, if desired, **Prefer PubMed metadata**.

For references already in Zotero:

1. Select the items.
2. Choose **Tools → Verify selected references by PMID / DOI…**.
3. Use **Verify reference** for one item or **Verify all / retry unfinished** for a batch.
4. Use **Review changes** to compare values, then **Apply checked changes** for selected replacements.

With PubMed enabled, a known PMID goes directly to PubMed. Otherwise, a DOI can be used to find a PMID, with DOI-registry lookup as fallback. A failed direct PMID fetch is reported for retry. PMCID is retained and compared but is not an independent lookup route in this version.

Matching records can receive missing abstracts and bibliographic details when the provider supplies them. Existing values are preserved unless you approve replacements. Progress, elapsed time, timeouts and stop/retry controls are provided. References without a usable DOI or PMID cannot be searched automatically by title.

Online verification sends identifiers to metadata providers; it does not upload the manuscript. Reference extraction and offline recovery use local data.

## Recover metadata from previous imports

Select the references and choose **Tools → Recover embedded metadata for selected references…**.

This reads saved **Original EndNote metadata** notes, fills missing supported fields and identifiers, and adds a readable source note. Existing nonempty fields and tags remain unchanged. Recovery requires the source information to have been retained; it cannot recreate absent metadata.

## Convert EndNote citations to Zotero

1. Import the document's references into Zotero first.
2. Select a collection in the same Zotero library.
3. Save and close the source document in Word.
4. Choose **Tools → Convert EndNote citations to Zotero…**.
5. Select the DOCX and choose an installed in-text citation style with a bibliography from the searchable style list.
6. Save the converted copy under a new filename.
7. Open the copy in Word with Zotero running and click **Zotero → Refresh**.
8. Test **Add/Edit Citation**. Use **Document Preferences** to change the style.

If the source has no bibliography field, insert one using **Add/Edit Bibliography**.

Conversion matches every cited reference to one Zotero item. It preserves supported citation groups, page locators, prefixes, suffixes and author suppression. Existing displayed text and formatting remain until Zotero refreshes the fields. Unmatched or ambiguous references and unsupported settings stop conversion before saving.

## Convert Zotero citations to EndNote

1. Refresh and save the original document using Zotero if its references have changed, then close it in Word.
2. In Zotero, choose **Tools → Convert Zotero citations to EndNote…**.
3. Select the Zotero-cited DOCX, review the conversion counts and save a separate copy.
4. Open the converted copy in Word with EndNote installed.
5. Choose **EndNote → Export to EndNote → Export Traveling Library** and export into a new EndNote library.
6. With that library open, select an EndNote style and test **Update Citations and Bibliography** and **Edit & Manage Citation(s)**.

**No separate RIS export is needed for this workflow.** The converted fields contain traveling-library metadata. Do not unformat the converted document before testing it.

This direction uses metadata embedded in Zotero's citation fields, not subsequent edits in the Zotero library. It generates new EndNote record identifiers; these do not automatically link to an existing `.enl` library. Attachments and library notes absent from the citation metadata are not recovered.

## Conversion limitations

- Both directions save a new DOCX and leave the source unchanged.
- Conversion supports standard DOCX complex citation fields in the body, footnotes and endnotes. Plain-text citations, legacy `.doc` files and password-protected documents are unsupported.
- Mixed Zotero/EndNote fields, tracked citation changes, unsupported field locations, missing or conflicting metadata, and unsupported citation settings can stop conversion.
- Zotero → EndNote also rejects unsupported reference types, non-page locators, customized bibliographies and manually edited citations, including citations marked `dontUpdate`. Restore such citations through Zotero's **Add/Edit Citation**, save and retry.
- Citation managers regenerate formatting on refresh. Exact round-trip formatting and manual bibliography edits are not guaranteed.
- Automated field and package checks do not establish Word add-in compatibility. Actual Zotero Refresh/Add/Edit Citation and EndNote recognition/editing require desktop validation.

This is an independent community plugin, not an official Zotero or EndNote product.
