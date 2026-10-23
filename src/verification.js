/* Pure comparison rules. Bibliographic identity must agree before automatic enrichment. */
var TLVerification = (() => {
  const fields = ['PMID','PMCID','title','shortTitle','publicationTitle','journalAbbreviation','date','volume','issue','pages','DOI','ISSN','ISBN','url','abstractNote','language','publisher','place','edition','series','seriesTitle'];
  const normalize = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu,'').replace(/<[^>]*>/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const doi = value => String(value || '').trim().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/i,'').toLowerCase();
  const empty = value => value == null || value === '' || (Array.isArray(value) && !value.length);
  const authors = value => (value || []).filter(c => c.creatorType === 'author').map(c => normalize(c.lastName || c.name)).filter(Boolean);
  const creatorValue = list => JSON.stringify((list || []).map(c => [c.creatorType,c.firstName || '',c.lastName || '',c.name || '']));
  function compare(local, remote) {
    const reasons = [];
    const samePMID = /^\d+$/.test(local.PMID || '') && local.PMID === remote.PMID;
    if (local.DOI && remote.DOI && doi(local.DOI)!==doi(remote.DOI)) reasons.push('Retrieved DOI does not match');
    else if (!samePMID && (!local.DOI || !remote.DOI)) reasons.push('No matching DOI or PMID');
    if(local.PMID && remote.PMID && local.PMID!==remote.PMID)reasons.push('Retrieved PMID does not match');
    if(local.PMCID && remote.PMCID && local.PMCID!==remote.PMCID)reasons.push('Retrieved PMCID does not match');
    if (!normalize(local.title) || normalize(local.title) !== normalize(remote.title)) reasons.push('Titles differ');
    const a=authors(local.creators), b=authors(remote.creators);
    if (a.length && (!b.length || a[0] !== b[0])) reasons.push('First authors differ or are unavailable');
    if (local.itemType !== remote.itemType) reasons.push('Reference types differ');
    const changes = fields.filter(key => !empty(remote[key]) && String(local[key] || '') !== String(remote[key]))
      .map(key => ({key, before:local[key] || '', after:remote[key], missing:empty(local[key])}));
    if (remote.creators?.length && creatorValue(local.creators) !== creatorValue(remote.creators)) {
      changes.push({key:'creators',before:local.creators || [],after:remote.creators,missing:!local.creators?.length});
    }
    return {matched:!reasons.length,reasons,changes};
  }
  return {compare,fields,doi,empty};
})();
if (typeof module !== 'undefined') module.exports = TLVerification;
