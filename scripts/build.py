"""Build a reproducible XPI from an explicit source directory; no user files."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'src/manifest.json').read_text())
version = manifest['version']
application = manifest['applications']['zotero']
for required in ('id', 'update_url', 'strict_min_version', 'strict_max_version'):
    if not application.get(required):
        raise ValueError(f'Missing required Zotero manifest key: {required}')
out = root / 'dist'
out.mkdir(exist_ok=True)
target = out / f'traveling-library-{version}.xpi'
with ZipFile(target, 'w') as archive:
    for file in sorted((root / 'src').rglob('*')):
        if not file.is_file():
            continue
        info = ZipInfo(file.relative_to(root / 'src').as_posix(), (2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, file.read_bytes())
digest = hashlib.sha256(target.read_bytes()).hexdigest()
(out / 'SHA256SUMS').write_text(f'{digest}  {target.name}\n')
updates = {'addons': {application['id']: {'updates': [{
    'version': version,
    'update_link': f'https://github.com/arunviswanathan91/traveling-library/raw/refs/heads/main/dist/{target.name}',
    'update_hash': 'sha256:' + digest,
    'applications': {'zotero': {key: application[key] for key in ('strict_min_version', 'strict_max_version')}}
}]}}}
(root / 'updates.json').write_text(json.dumps(updates, indent=2) + '\n')
print(target)
