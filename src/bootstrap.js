/* global Zotero, Services, Cc, Ci */
var chromeHandle, scope, menuIDs = [], running = false;
const PLUGIN_ID = 'traveling-library@arunviswanathan91';

async function startup({ rootURI }) {
  scope = { Zotero, Services, Cc, Ci };
  Services.scriptloader.loadSubScript(rootURI + 'core.js', scope);
  chromeHandle = Cc['@mozilla.org/addons/addon-manager-startup;1']
    .getService(Ci.amIAddonManagerStartup)
    .registerChrome(Services.io.newURI(rootURI + 'manifest.json'), [
      ['content', 'traveling-library', './']
    ]);
  if (Zotero.MenuManager) {
    for (const target of ['main/menubar/tools', 'main/library/collection']) {
      menuIDs.push(Zotero.MenuManager.registerMenu({
        menuID: 'traveling-library-' + target.replaceAll('/', '-'), pluginID: PLUGIN_ID,
        target, menus: [{ menuType: 'menuitem', l10nID: 'traveling-library-import',
          onCommand: () => runImport(Zotero.getMainWindow()) }]
      }));
    }
  } else {
    for (const window of Zotero.getMainWindows()) addMenu(window);
  }
}
function addMenu(window) {
  if (Zotero.MenuManager || window.document.getElementById('traveling-library-import')) return;
  const menu = window.document.createXULElement('menuitem');
  menu.id = 'traveling-library-import';
  menu.setAttribute('label', 'Import EndNote references from Word…');
  menu.addEventListener('command', () => runImport(window));
  window.document.getElementById('menu_ToolsPopup')?.appendChild(menu);
}
function onMainWindowLoad({ window }) { addMenu(window); }
function onMainWindowUnload() {}
function install() {}
function uninstall() {}
function shutdown() {
  for (const id of menuIDs) Zotero.MenuManager?.unregisterMenu(id);
  menuIDs = [];
  for (const window of Zotero.getMainWindows()) window.document.getElementById('traveling-library-import')?.remove();
  chromeHandle?.destruct();
  chromeHandle = null;
  scope = null;
}
function readDocx(path) {
  const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  if (file.fileSize > 200 * 1024 * 1024) throw new Error('This document exceeds the 200 MB input limit.');
  const zip = Cc['@mozilla.org/libjar/zip-reader;1'].createInstance(Ci.nsIZipReader);
  const parts = {};
  let total = 0;
  zip.open(file);
  try {
    if (!zip.hasEntry('word/document.xml')) throw new Error('Select an unencrypted .docx Word document.');
    const entries = zip.findEntries('word/*.xml');
    while (entries.hasMore()) {
      const name = entries.getNext();
      if (!/^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(name)) continue;
      const entry = zip.getEntry(name);
      total += entry.realSize;
      if (entry.realSize > 64 * 1024 * 1024 || total > 128 * 1024 * 1024) {
        throw new Error('The document XML exceeds the supported size limit.');
      }
      const input = zip.getInputStream(name);
      const stream = Cc['@mozilla.org/intl/converter-input-stream;1'].createInstance(Ci.nsIConverterInputStream);
      try {
        stream.init(input, 'UTF-8', 0, 0);
        const chunk = {};
        let xml = '';
        while (stream.readString(65536, chunk)) xml += chunk.value;
        parts[name] = xml;
      } finally { stream.close(); }
    }
  } finally { zip.close(); }
  return parts;
}
async function chooseFile(window) {
  let FilePicker;
  if (parseInt(Zotero.version, 10) >= 8) {
    ({ FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs'));
  } else {
    ({ FilePicker } = ChromeUtils.import('chrome://zotero/content/modules/filePicker.jsm'));
  }
  const picker = new FilePicker();
  picker.init(window, 'Choose a saved Word document containing EndNote citations', picker.modeOpen);
  picker.appendFilter('Word documents', '*.docx');
  if (await picker.show() !== picker.returnOK) return null;
  return picker.file;
}
async function translateRecords(records) {
  const translation = new Zotero.Translate.Import();
  translation.setString(scope.TLCore.asEndNoteXML(records));
  translation.setTranslator('eb7059a4-35ec-4961-a915-3cf58eb9784b');
  await translation.translate({ libraryID: false, saveAttachments: false });
  const items = translation.newItems;
  if (items.length !== records.length) throw new Error('EndNote translator returned an unexpected number of items. No references were saved.');
  // The native Endnote XML translator emits one item per record, sequentially.
  for (let i = 0; i < items.length; i++) {
    const clean = value => String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (clean(items[i].title) !== clean(records[i].title)) {
      throw new Error('Reference order/title could not be verified after translation. No references were saved.');
    }
  }
  return items;
}
function jsonForItem(raw, marker) {
  // Translation objects contain attachments, functions and internal IDs not accepted by fromJSON.
  const omitted = new Set(['attachments', 'notes', 'itemID', 'id', 'key', 'version', 'complete', 'seeAlso', 'relations', 'collections', 'parentItem']);
  const json = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!omitted.has(key) && typeof value !== 'function') json[key] = value;
  }
  json.creators = (raw.creators || []).map(c => c.fieldMode === 1
    ? { name: c.lastName || c.name || '', creatorType: c.creatorType }
    : { firstName: c.firstName || '', lastName: c.lastName || '', creatorType: c.creatorType });
  json.tags = (raw.tags || []).map(t => typeof t === 'string' ? { tag: t } : t);
  json.extra = [raw.extra || '', `Traveling Library ID: ${marker}`].filter(Boolean).join('\n');
  return json;
}
async function runImport(window) {
  if (running) return;
  running = true;
  let progress;
  const Core = scope.TLCore;
  try {
    const pane = window.ZoteroPane;
    const collection = pane.getSelectedCollection();
    if (!collection) throw new Error('Select the destination collection in the left Zotero pane, then run Import again.');
    const library = Zotero.Libraries.get(collection.libraryID);
    if (!library.editable) throw new Error('This collection belongs to a read-only library. Select a writable collection.');
    const path = await chooseFile(window);
    if (!path) return;
    progress = new Zotero.ProgressWindow({ closeOnClick: false });
    progress.changeHeadline('Reading EndNote references…');
    progress.show();
    await new Promise(resolve => window.setTimeout(resolve, 20));
    const extracted = Core.extract(readDocx(path), window);
    if (extracted.warnings.length) {
      throw new Error('The document needs review before import. No references were saved.\n\n' + extracted.warnings.slice(0,8).join('\n'));
    }
    if (!extracted.records.length) throw new Error('No embedded EndNote references were found. Plain-text bibliographies and legacy .doc files are not supported.');
    for (const record of extracted.records) record.marker = Zotero.Utilities.Internal.md5(record.identity);
    const existing = (await Zotero.Items.getAll(collection.libraryID, true, false))
      .filter(item => item.isRegularItem() && !item.deleted)
      .map(item => ({ id: item.id, DOI: item.getField('DOI'), extra: item.getField('extra') }));
    const rows = Core.plan(extracted.records, existing);
    const args = { rows, accepted: false, preserveRaw: true,
      destination: `${library.name} / ${collection.name}`, fileName: path.split(/[\\/]/).pop(),
      deletedFields: extracted.deletedFields };
    progress.close(); progress = null;
    window.openDialog('chrome://traveling-library/content/review.xhtml', 'traveling-library-review',
      'chrome,centerscreen,resizable,dialog,modal,width=900,height=620', args);
    if (!args.accepted) return;
    const selected = rows.filter(row => row.selected && ['new','reuse'].includes(row.action));
    if (!selected.length) return;
    const newRows = selected.filter(row => row.action === 'new');
    progress = new Zotero.ProgressWindow({ closeOnClick: false });
    progress.changeHeadline('Importing EndNote references…'); progress.show();
    const translated = newRows.length ? await translateRecords(newRows.map(row => row.record)) : [];
    const ids = [];
    // Import and collection membership changes either all commit or all roll back.
    await Zotero.DB.executeTransaction(async () => {
      if (!Zotero.Libraries.get(collection.libraryID).editable) throw new Error('The destination is no longer writable.');
      for (const row of selected.filter(row => row.action === 'reuse')) {
        const item = await Zotero.Items.getAsync(row.itemID);
        if (!item || item.deleted || item.libraryID !== collection.libraryID) throw new Error('An existing match changed. Run the import again.');
        item.addToCollection(collection.id);
        await item.save();
        ids.push(item.id);
      }
      for (let i = 0; i < newRows.length; i++) {
        const row = newRows[i], raw = translated[i];
        const item = new Zotero.Item(raw.itemType);
        item.libraryID = collection.libraryID;
        item.fromJSON(jsonForItem(raw, row.record.marker));
        item.addToCollection(collection.id);
        await item.save();
        ids.push(item.id);
        // Native translator notes retain metadata that has no corresponding Zotero field.
        for (const rawNote of raw.notes || []) {
          const content = typeof rawNote === 'string' ? rawNote : rawNote.note;
          if (!content) continue;
          const note = new Zotero.Item('note'); note.libraryID = collection.libraryID; note.parentID = item.id;
          note.setNote(content); await note.save();
        }
        if (args.preserveRaw) {
          const note = new Zotero.Item('note'); note.libraryID = collection.libraryID; note.parentID = item.id;
          const variants = row.record.variants || [row.record.xml];
          note.setNote('<h2>Original EndNote metadata</h2><p>Recovered from ' + Core.escapeHTML(args.fileName)
            + '. Source metadata is preserved below; linked PDF files are not embedded in this record.</p>'
            + variants.map(xml => '<pre>' + Core.escapeHTML(xml) + '</pre>').join(''));
          await note.save();
        }
      }
    });
    progress.close(); progress = null;
    Services.prompt.alert(window, 'Traveling Library',
      `${newRows.length} new references imported.\n${selected.length - newRows.length} existing references added to the collection.\n\nDestination: ${args.destination}\n\nThe Word document and its EndNote citation fields were not changed.`);
    if (ids.length) await pane.selectItems(ids);
  } catch (error) {
    Zotero.logError(error);
    Services.prompt.alert(window, 'Traveling Library', error.message || String(error));
  } finally {
    progress?.close();
    running = false;
  }
}
