/* global Zotero, Services, Cc, Ci */
var chromeHandle, scope, menuIDs = [], running = false;
const PLUGIN_ID = 'traveling-library@arunviswanathan91';

async function startup({ rootURI }) {
  scope = { Zotero, Services, Cc, Ci };
  Services.scriptloader.loadSubScript(rootURI + 'core.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'verification.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'metadata.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'conversion.js', scope);
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
  }
  if (Zotero.MenuManager) {
    for (const target of ['main/menubar/tools','main/library/item']) menuIDs.push(Zotero.MenuManager.registerMenu({
      menuID:'traveling-library-verify-'+target.replaceAll('/','-'),pluginID:PLUGIN_ID,target,
      menus:[{menuType:'menuitem',l10nID:'traveling-library-verify',onCommand:()=>{
        const win=Zotero.getMainWindow();openVerification(win,win.ZoteroPane.getSelectedItems().filter(i=>i.isRegularItem()).map(i=>i.id));
      }}]
    }));
  }
  if(Zotero.MenuManager)menuIDs.push(Zotero.MenuManager.registerMenu({
    menuID:'traveling-library-recover',pluginID:PLUGIN_ID,target:'main/menubar/tools',
    menus:[{menuType:'menuitem',l10nID:'traveling-library-recover',onCommand:()=>recoverSelected(Zotero.getMainWindow())}]
  }));
  if(Zotero.MenuManager)menuIDs.push(Zotero.MenuManager.registerMenu({
    menuID:'traveling-library-convert',pluginID:PLUGIN_ID,target:'main/menubar/tools',
    menus:[{menuType:'menuitem',l10nID:'traveling-library-convert',onCommand:()=>runConversion(Zotero.getMainWindow())}]
  }));
  for (const window of Zotero.getMainWindows()) addMenu(window);
}
function addMenu(window) {
  window.MozXULElement.insertFTLIfNeeded('traveling-library.ftl');
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
function readDocx(path, forConversion=false) {
  const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  if (file.fileSize > 200 * 1024 * 1024) throw new Error('This document exceeds the 200 MB input limit.');
  const zip = Cc['@mozilla.org/libjar/zip-reader;1'].createInstance(Ci.nsIZipReader);
  const parts = {};
  let total = 0;
  zip.open(file);
  try {
    if (!zip.hasEntry('word/document.xml')) throw new Error('Select an unencrypted .docx Word document.');
    if(forConversion && zip.findEntries('_xmlsignatures/*').hasMore())throw new Error('Digitally signed documents are not supported for conversion.');
    const entries = zip.findEntries(forConversion ? '*' : 'word/*.xml');
    while (entries.hasMore()) {
      const name = entries.getNext();
      if (forConversion ? !(/^word\/.*\.xml$/.test(name)||['docProps/custom.xml','[Content_Types].xml','_rels/.rels'].includes(name)) : !/^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(name)) continue;
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
async function translateRecords(records, window) {
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
  return items.map((item,i)=>{
    const node=scope.TLCore.parseXML(records[i].xml,window).documentElement;
    const result=scope.TLMetadata.supplement(item,node);
    for(const key of ['PMID','PMCID'])if(records[i][key]&&!result[key])result[key]=records[i][key];
    result.notes=[...(result.notes || []),scope.TLMetadata.note((records[i].variants || [records[i].xml]).map(xml=>scope.TLCore.parseXML(xml,window).documentElement))].filter(Boolean);
    return result;
  });
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
    const translated = newRows.length ? await translateRecords(newRows.map(row => row.record),window) : [];
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
        const json=jsonForItem(raw, row.record.marker);
        delete json.PMID;delete json.PMCID;
        item.fromJSON(json);
        for(const key of ['PMID','PMCID'])if(raw[key])setIdentifierField(item,key,raw[key]);
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
    if (args.verifyAfterImport) openVerification(window,ids,true,args.preferPubMed);
  } catch (error) {
    Zotero.logError(error);
    Services.prompt.alert(window, 'Traveling Library', error.message || String(error));
  } finally {
    progress?.close();
    running = false;
  }
}

function snapshotItem(item) {
  const data=item.toJSON();
  for(const key of ['PMID','PMCID']) data[key]=data[key] || (data.extra || '').match(new RegExp('^'+key+':\\s*(\\S+)','m'))?.[1] || '';
  return data;
}
async function nativeLookup(identifier, window) {
  const translation=new Zotero.Translate.Search();
  translation.setIdentifier(identifier);
  let timer;
  try {
    return await Promise.race([
      (async()=>{
        const translators=await translation.getTranslators();
        if(!translators.length)return null;
        translation.setTranslator(translators);
        await translation.translate({libraryID:false,saveAttachments:false});
        return translation.newItems?.[0] || null;
      })(),
      new Promise((resolve,reject)=>{timer=window.setTimeout(()=>reject(new Error('Lookup timed out; retry this reference')),20000);})
    ]);
  } finally {window.clearTimeout(timer);}
}
async function pubmedLookup(pmid, window, report=()=>{}) {
  report('Fetching PubMed PMID '+pmid);
  const response=await Zotero.HTTP.request('GET','https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&tool=traveling_library&id='+encodeURIComponent(pmid),{responseType:'text',timeout:15000});
  report('Reading PubMed metadata');
  const translation=new Zotero.Translate.Import();
  translation.setTranslator('fcf41bed-0cbc-3704-85c7-8062a0068a7a');
  translation.setString(response.responseText || response.response);
  let timer;
  try {
    await Promise.race([translation.translate({libraryID:false,saveAttachments:false}),new Promise((_,reject)=>{timer=window.setTimeout(()=>reject(new Error('PubMed translation timed out')),15000);})]);
  } finally {window.clearTimeout(timer);}
  if(translation.newItems?.length!==1)throw new Error('PubMed did not return exactly one reference');
  const remote=translation.newItems[0];
  const actual=remote.PMID || (remote.extra || '').match(/^PMID:\s*(\d+)/m)?.[1];
  if(String(actual)!==String(pmid))throw new Error('Returned PMID does not match requested PMID');
  return remote;
}
async function lookupReference(doi, preferPubMed, window, knownPMID='', report=()=>{}) {
  let fallback='';
  if(preferPubMed && knownPMID) {
    // A known identifier takes the direct route. Surface errors instead of silently
    // stacking another long search onto a failed direct lookup.
    return {remote:await pubmedLookup(knownPMID,window,report),source:'PubMed (existing PMID)'};
  }
  if(preferPubMed) {
    try {
      report('Searching PubMed by DOI');
      const url='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=2&tool=traveling_library&term='+encodeURIComponent('"'+doi+'"[AID]');
      const response=await Zotero.HTTP.request('GET',url,{responseType:'json',timeout:15000});
      const result=response.response?.esearchresult;
      if(!result || result.error)throw new Error('PubMed search failed');
      if(Number(result.count)===1 && /^\d+$/.test(result.idlist?.[0] || '')) {
        await new Promise(resolve=>window.setTimeout(resolve,400));
        const remote=await pubmedLookup(result.idlist[0],window,report);
        if(remote && scope.TLCore.doi(remote.DOI)===doi) return {remote,source:'PubMed'};
        fallback='PubMed record did not confirm the DOI; used DOI lookup.';
      } else fallback=Number(result.count)>1?'Multiple PubMed matches; used DOI lookup.':'No PubMed match; used DOI lookup.';
    } catch(error){fallback='PubMed unavailable ('+error.message+'); used DOI lookup.';}
  }
  report('Looking up DOI with Zotero');
  return {remote:await nativeLookup({DOI:doi},window),source:'DOI registry',fallback};
}
function setIdentifierField(item,key,value) {
  const fieldID=Zotero.ItemFields?.getID(key);
  if(fieldID && Zotero.ItemFields.isValidForType(fieldID,item.itemTypeID))item.setField(key,value);
  else {
    const extra=item.getField('extra') || '';
    item.setField('extra',extra.split('\n').filter(line=>!line.startsWith(key+':')).concat(key+': '+value).join('\n').trim());
  }
}
async function recoverIdentifiers(item,window,isClosed=()=>false) {
  const snapshot=snapshotItem(item);
  const sourceRecords=[];
  let hasReadableNote=false;
  const values={PMID:new Set(),PMCID:new Set()};
  if(snapshot.PMID)values.PMID.add(snapshot.PMID);
  if(snapshot.PMCID)values.PMCID.add(snapshot.PMCID);
  if(snapshot.url) {
    const doc=new window.DOMParser().parseFromString('<record/>','application/xml');
    const url=doc.createElement('url');url.textContent=snapshot.url;doc.documentElement.appendChild(url);
    const found=scope.TLCore.identifiers(doc.documentElement);if(found.PMID)values.PMID.add(found.PMID);
  }
  for(const id of item.getNotes?.() || []) {
    const note=await Zotero.Items.getAsync(id);
    const doc=new window.DOMParser().parseFromString(note.getNote(),'text/html');
    if(doc.querySelector('h2')?.textContent==='EndNote source metadata — readable copy')hasReadableNote=true;
    if(doc.querySelector('h2')?.textContent!=='Original EndNote metadata')continue;
    for(const pre of doc.querySelectorAll('pre')) {
      const xml=scope.TLCore.parseXML(pre.textContent,window);
      for(const record of xml.getElementsByTagName('record')) {
        sourceRecords.push(record);
        const found=scope.TLCore.identifiers(record);
        for(const key of ['PMID','PMCID'])if(found[key])values[key].add(found[key]);
      }
    }
  }
  const changes=[];
  for(const key of ['PMID','PMCID'])if(!snapshot[key] && values[key].size===1)changes.push({key,after:[...values[key]][0]});
  if(scope.TLMetadata && sourceRecords.length) {
    const candidates=new Map();
    for(const record of sourceRecords)for(const [key,val] of Object.entries(scope.TLMetadata.read(record).fields)) {
      if(!candidates.has(key))candidates.set(key,new Set());candidates.get(key).add(val);
    }
    for(const [key,vals] of candidates)if(!snapshot[key]&&vals.size===1&&Zotero.ItemFields.isValidForType(Zotero.ItemFields.getID(key),item.itemTypeID))changes.push({key,after:[...vals][0]});
  }
  if(isClosed())return;
  if(changes.length)await applyEnrichment(item.id,changes,snapshot);
  if(scope.TLMetadata && sourceRecords.length && !hasReadableNote) {
    await Zotero.DB.executeTransaction(async()=>{
      if(item.deleted || !Zotero.Libraries.get(item.libraryID).editable)throw new Error('Reference is unavailable or read-only.');
      const note=new Zotero.Item('note');note.libraryID=item.libraryID;note.parentID=item.id;
      note.setNote(scope.TLMetadata.note(sourceRecords));await note.save();
    });
  }
}
async function applyEnrichment(id, changes, snapshot) {
  const allowed=new Set([...scope.TLVerification.fields,'creators','PMID','PMCID']);
  await Zotero.DB.executeTransaction(async()=>{
    const item=await Zotero.Items.getAsync(id);
    if(!item || item.deleted || !Zotero.Libraries.get(item.libraryID).editable)throw new Error('Reference is unavailable or read-only.');
    const current=snapshotItem(item);
    // Protect concurrent edits made while the lookup/review dialog was open.
    for(const key of ['title','DOI','creators',...changes.map(c=>c.key)]) {
      if(JSON.stringify(current[key] || '')!==JSON.stringify(snapshot[key] || ''))throw new Error('Reference changed since verification. Verify it again before applying changes.');
    }
    for(const change of changes) {
      if(!allowed.has(change.key))throw new Error('Unsupported metadata field');
      if(change.key==='creators')item.setCreators(change.after.map(c=>c.name?{lastName:c.name,fieldMode:1,creatorType:c.creatorType}:c));
      else if(['PMID','PMCID'].includes(change.key)) {
        const regex=change.key==='PMID'?/^\d+$/:/^PMC\d+$/;
        if(!regex.test(change.after))throw new Error('Invalid PubMed identifier');
        setIdentifierField(item,change.key,change.after);
      } else {
        const fieldID=Zotero.ItemFields.getID(change.key);
        if(fieldID && Zotero.ItemFields.isValidForType(fieldID,item.itemTypeID))item.setField(change.key,change.after);
      }
    }
    await item.save();
  });
}
function openVerification(window, ids, auto=false, preferPubMed=true) {
  const items=ids.map(id=>Zotero.Items.get(id)).filter(item=>item?.isRegularItem()&&!item.deleted);
  if(!items.length){Services.prompt.alert(window,'Traveling Library','Select references to verify first.');return;}
  const args={auto,preferPubMed,items:items.map(item=>({id:item.id,title:item.getField('title'),DOI:item.getField('DOI')})),
    apply:applyEnrichment,
    verify:async(id,isClosed,usePubMed,report=()=>{},dialogWindow=window)=>{
      window=dialogWindow;
      report('Recovering embedded identifiers');
      await recoverIdentifiers(await Zotero.Items.getAsync(id),window,isClosed);
      if(isClosed())return {code:'cancelled',status:'Cancelled',changes:[],reasons:[]};
      const item=await Zotero.Items.getAsync(id), snapshot=snapshotItem(item);
      const doi=scope.TLCore.doi(snapshot.DOI);
      if(!doi && !(usePubMed && /^\d+$/.test(snapshot.PMID)))return {code:'no-doi',status:'No usable DOI or PMID',changes:[],reasons:[]};
      const {remote,source,fallback}=await lookupReference(doi,usePubMed,window,/^\d+$/.test(snapshot.PMID)?snapshot.PMID:'',report);
      if(isClosed())return {code:'cancelled',status:'Cancelled',changes:[],reasons:[]};
      if(!remote)return {code:'not-found',status:'No metadata found — retry available',changes:[],reasons:[]};
      const data=jsonForItem(remote,'');delete data.extra;
      for(const key of ['PMID','PMCID'])data[key]=remote[key] || (remote.extra || '').match(new RegExp('^'+key+':\\s*(\\S+)','m'))?.[1] || '';
      const result=scope.TLVerification.compare(snapshot,data);
      // Ignore fields that cannot be written to this item's existing reference type.
      result.changes=result.changes.filter(c=>['creators','PMID','PMCID'].includes(c.key)||Zotero.ItemFields.isValidForType(Zotero.ItemFields.getID(c.key),item.itemTypeID));
      const missing=result.matched?result.changes.filter(c=>c.missing):[];
      if(missing.length&&!isClosed())await applyEnrichment(id,missing,snapshot);
      const fresh=snapshotItem(await Zotero.Items.getAsync(id));
      const remaining=scope.TLVerification.compare(fresh,data);
      remaining.changes=remaining.changes.filter(c=>['creators','PMID','PMCID'].includes(c.key)||Zotero.ItemFields.isValidForType(Zotero.ItemFields.getID(c.key),item.itemTypeID));
      return {...remaining,snapshot:fresh,code:result.matched?'verified':'conflict',
        status:(result.matched?`Verified (${source}); ${missing.length} fields filled`:`Needs review (${source})`)+(fallback?' — '+fallback:'')};
    }};
  window.openDialog('chrome://traveling-library/content/verify.xhtml','traveling-library-verify','chrome,centerscreen,resizable,dialog,modal,width=1000,height=740',args);
}

async function recoverSelected(window) {
  if(running)return;running=true;
  let completed=0;const errors=[];
  try {
    const items=window.ZoteroPane.getSelectedItems().filter(i=>i.isRegularItem()&&!i.deleted);
    if(!items.length)throw new Error('Select imported references first.');
    for(const item of items) {
      try {await recoverIdentifiers(item,window);completed++;}
      catch(error){errors.push(item.id+': '+error.message);}
    }
    Services.prompt.alert(window,'Traveling Library',`${completed} references checked for recoverable source metadata. Existing values were preserved. No online requests were made.`+(errors.length?'\nErrors:\n'+errors.join('\n'):''));
  } catch(error){Services.prompt.alert(window,'Traveling Library',error.message);}
  finally{running=false;}
}

async function saveConvertedCopy(window,source,changes) {
  let FilePicker;
  if(parseInt(Zotero.version,10)>=8)({FilePicker}=ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs'));
  else ({FilePicker}=ChromeUtils.import('chrome://zotero/content/modules/filePicker.jsm'));
  const picker=new FilePicker();picker.init(window,'Save converted Zotero document',picker.modeSave);picker.appendFilter('Word document','*.docx');
  picker.defaultString=source.split(/[\\/]/).pop().replace(/\.docx$/i,'')+'-Zotero.docx';
  if(await picker.show()===picker.returnCancel)return null;
  let output=picker.file;if(!/\.docx$/i.test(output))output+='.docx';
  if(output.toLowerCase()===source.toLowerCase()||await IOUtils.exists(output))throw new Error('Choose a new filename. Existing documents are never overwritten.');
  const temp=output+'.tmp-'+Zotero.randomString(12),entryTemp=temp+'.xml';let writer;
  try {
    await IOUtils.copy(source,temp,{noOverwrite:true});
    writer=Cc['@mozilla.org/zipwriter;1'].createInstance(Ci.nsIZipWriter);
    writer.open(Zotero.File.pathToFile(temp),0x04);
    for(const [name,xml] of Object.entries(changes)) {
      await Zotero.File.putContentsAsync(entryTemp,xml);
      if(writer.hasEntry(name))writer.removeEntry(name,false);
      writer.addEntryFile(name,Ci.nsIZipWriter.COMPRESSION_DEFAULT,Zotero.File.pathToFile(entryTemp),false);
    }
    writer.close();writer=null;
    // Read the finalized ZIP before exposing it as the output document.
    const verify=readDocx(temp,true);
    for(const [name,xml] of Object.entries(changes))if(verify[name]!==xml)throw new Error('Converted ZIP validation failed for '+name);
    await IOUtils.move(temp,output,{noOverwrite:true});return output;
  } finally {
    try{writer?.close();}finally{await IOUtils.remove(temp,{ignoreAbsent:true});await IOUtils.remove(entryTemp,{ignoreAbsent:true});}
  }
}
async function runConversion(window) {
  if(running)return;running=true;
  try {
    if(parseInt(Zotero.version,10)<8)throw new Error('Document conversion requires Zotero 8 or newer.');
    const collection=window.ZoteroPane.getSelectedCollection();
    if(!collection)throw new Error('Select the collection containing your imported references first.');
    const source=await chooseFile(window);if(!source)return;
    const parts=readDocx(source,true);
    const items=(await Zotero.Items.getAll(collection.libraryID,true,false)).filter(i=>i.isRegularItem()&&!i.deleted);
    await Zotero.Items.loadDataTypes(items);
    const mapped=items.map(i=>({id:i.id,title:i.getField('title'),DOI:i.getField('DOI'),extra:i.getField('extra'),uri:Zotero.URI.getItemURI(i),itemData:Zotero.Utilities.Item.itemToCSLJSON(i)}));
    const result=scope.TLConversion.convert(parts,mapped,window,scope.TLCore,Zotero.Utilities.Internal.md5,()=>Zotero.randomString(16));
    await Zotero.Styles.init();
    const styles=Zotero.Styles.getVisible().filter(s=>s.class==='in-text'&&s.hasBibliography).map(s=>({id:s.styleID,title:s.title}));
    if(!styles.length)throw new Error('Install an in-text citation style with a bibliography in Zotero Settings → Cite first.');
    const args={accepted:false,styles,result:{citations:result.citations,bibliographies:result.bibliographies,itemOccurrences:result.itemOccurrences},name:source.split(/[\\/]/).pop()};
    window.openDialog('chrome://traveling-library/content/convert.xhtml','traveling-library-convert','chrome,centerscreen,resizable,dialog,modal,width=650,height=480',args);
    if(!args.accepted)return;
    if(!styles.some(s=>s.id===args.styleID))throw new Error('Select a valid citation style.');
    const data=new Zotero.Integration.DocumentData();data.sessionID=Zotero.randomString(16);data.style={styleID:args.styleID,hasBibliography:true,bibliographyStyleHasBeenSet:false};data.prefs={fieldType:'Field',noteType:0,automaticJournalAbbreviations:false};
    Object.assign(result.changes,scope.TLConversion.documentSettings(parts,window,scope.TLCore,data.serialize()));
    const path=await saveConvertedCopy(window,source,result.changes);if(!path)return;
    Services.prompt.alert(window,'Traveling Library',`Saved: ${path}\n\n${result.citations} citation groups and ${result.bibliographies} bibliography fields converted.\n\nOpen this copy in desktop Word and click Zotero → Refresh. Test Add/Edit Citation on a citation. The current displayed text is retained until Refresh. The original document is unchanged.`+(result.bibliographies?'':'\nNo EndNote bibliography field was present; use Zotero → Add/Edit Bibliography.'));
  } catch(error){Zotero.logError(error);Services.prompt.alert(window,'Traveling Library',error.message || String(error));}
  finally{running=false;}
}
