"""Build a reproducible XPI from an explicit source directory; no user files."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'src/manifest.json').read_text())['version']
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
(out / 'SHA256SUMS').write_text(f'{hashlib.sha256(target.read_bytes()).hexdigest()}  {target.name}\n')
print(target)
