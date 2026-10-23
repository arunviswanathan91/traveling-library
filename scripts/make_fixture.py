"""Create a minimal, entirely synthetic Word test file outside the source tree."""
import base64
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

record = '<EndNote><Cite><record><rec-number>1</rec-number><foreign-keys><key app="EN" db-id="synthetic-library">1</key></foreign-keys><ref-type name="Journal Article">17</ref-type><contributors><authors><author>Example, Alex</author></authors></contributors><titles><title>Synthetic traveling-library test</title><secondary-title>Example Journal</secondary-title></titles><dates><year>2025</year></dates><electronic-resource-num>10.1234/synthetic-test</electronic-resource-num><keywords><keyword>synthetic</keyword></keywords></record></Cite></EndNote>'
payload = base64.b64encode((record+'\0').encode()).decode()
body = f'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic example </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"><w:fldData>{payload}</w:fldData></w:fldChar></w:r><w:r><w:instrText xml:space="preserve"> ADDIN EN.CITE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>[1]</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:body></w:document>'
target = Path('synthetic-traveling-library.docx')
with ZipFile(target, 'w', ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml', body)
print(target.resolve())
