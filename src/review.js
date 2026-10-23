window.addEventListener('DOMContentLoaded', () => {
  const args = window.arguments[0];
  const $ = id => document.getElementById(id);
  const make = name => document.createElementNS('http://www.w3.org/1999/xhtml', name);
  $('destination').textContent = 'Destination: ' + args.destination;
  $('file').textContent = args.fileName;
  function update() {
    const selected = args.rows.filter(row => row.selected);
    const added = selected.filter(row => row.action === 'new').length;
    const reused = selected.filter(row => row.action === 'reuse').length;
    const ambiguous = args.rows.filter(row => row.action === 'ambiguous').length;
    $('summary').textContent = `${args.rows.length} references found · ${added} new · ${reused} existing matches · ${ambiguous} ambiguous`;
    $('import').disabled = !selected.length;
  }
  for (const row of args.rows) {
    const tr = make('tr'), select = make('td'), checkbox = make('input');
    checkbox.type = 'checkbox'; checkbox.checked = row.selected;
    checkbox.disabled = !['new', 'reuse'].includes(row.action);
    checkbox.setAttribute('aria-label', 'Import ' + row.record.title);
    checkbox.addEventListener('change', () => { row.selected = checkbox.checked; update(); });
    select.appendChild(checkbox); tr.appendChild(select);
    const title = make('td'); title.textContent = row.record.title;
    const detail = make('small'); detail.textContent = [row.record.author, row.record.DOI].filter(Boolean).join(' · ');
    title.appendChild(detail); tr.appendChild(title);
    const year = make('td'); year.textContent = row.record.year; tr.appendChild(year);
    const action = make('td'); action.textContent = { new: 'Create', reuse: 'Reuse existing', ambiguous: 'Resolve duplicates', duplicate: 'Repeated source' }[row.action];
    tr.appendChild(action); $('rows').appendChild(tr);
  }
  $('cancel').addEventListener('click', () => window.close());
  $('import').addEventListener('click', () => { args.accepted = true; args.preserveRaw = $('raw').checked; window.close(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') window.close(); });
  update();
});
