type PptxImageSlide = {
  title: string;
  png: Uint8Array;
};

const enc = new TextEncoder();
const PPT_W = 9144000;
const PPT_H = 5143500;

function strBytes(value: string) {
  return enc.encode(value);
}

function u32(value: number) {
  return value >>> 0;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i]!;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return u32(crc ^ 0xffffffff);
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function write16(out: number[], value: number) {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function write32(out: number[], value: number) {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function pushBytes(out: number[], bytes: Uint8Array) {
  for (const byte of bytes) out.push(byte);
}

function zipStore(files: Array<{ path: string; data: Uint8Array }>) {
  const out: number[] = [];
  const central: Array<{
    name: Uint8Array;
    crc: number;
    size: number;
    offset: number;
  }> = [];
  const stamp = dosDateTime();

  for (const file of files) {
    const name = strBytes(file.path);
    const crc = crc32(file.data);
    const offset = out.length;
    write32(out, 0x04034b50);
    write16(out, 20);
    write16(out, 0);
    write16(out, 0);
    write16(out, stamp.dosTime);
    write16(out, stamp.dosDate);
    write32(out, crc);
    write32(out, file.data.length);
    write32(out, file.data.length);
    write16(out, name.length);
    write16(out, 0);
    pushBytes(out, name);
    pushBytes(out, file.data);
    central.push({ name, crc, size: file.data.length, offset });
  }

  const centralOffset = out.length;
  for (const file of central) {
    write32(out, 0x02014b50);
    write16(out, 20);
    write16(out, 20);
    write16(out, 0);
    write16(out, 0);
    write16(out, stamp.dosTime);
    write16(out, stamp.dosDate);
    write32(out, file.crc);
    write32(out, file.size);
    write32(out, file.size);
    write16(out, file.name.length);
    write16(out, 0);
    write16(out, 0);
    write16(out, 0);
    write16(out, 0);
    write32(out, 0);
    write32(out, file.offset);
    pushBytes(out, file.name);
  }
  const centralSize = out.length - centralOffset;
  write32(out, 0x06054b50);
  write16(out, 0);
  write16(out, 0);
  write16(out, central.length);
  write16(out, central.length);
  write32(out, centralSize);
  write32(out, centralOffset);
  write16(out, 0);
  return new Uint8Array(out);
}

function xml(value: string) {
  return strBytes(value);
}

function slideXml(index: number) {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide ${index}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${PPT_W}" cy="${PPT_H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
}

function slideRelXml(index: number) {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${index}.png"/></Relationships>`);
}

export function createImageOnlyPptx(slides: PptxImageSlide[]) {
  const overrides = slides
    .map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join("");
  const slideIds = slides.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
  const rels = slides
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`)
    .join("");
  const files: Array<{ path: string; data: Uint8Array }> = [
    {
      path: "[Content_Types].xml",
      data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides}</Types>`),
    },
    {
      path: "_rels/.rels",
      data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    },
    {
      path: "ppt/presentation.xml",
      data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${PPT_W}" cy="${PPT_H}" type="wide"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`),
    },
    {
      path: "ppt/_rels/presentation.xml.rels",
      data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`),
    },
    {
      path: "docProps/core.xml",
      data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Gestao de desempenho - colheita</dc:title><dc:creator>Controle Agricola</dc:creator><cp:lastModifiedBy>Controle Agricola</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified></cp:coreProperties>`),
    },
    {
      path: "docProps/app.xml",
      data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Controle Agricola</Application><Slides>${slides.length}</Slides></Properties>`),
    },
  ];
  slides.forEach((slide, index) => {
    files.push({ path: `ppt/slides/slide${index + 1}.xml`, data: slideXml(index + 1) });
    files.push({ path: `ppt/slides/_rels/slide${index + 1}.xml.rels`, data: slideRelXml(index + 1) });
    files.push({ path: `ppt/media/image${index + 1}.png`, data: slide.png });
  });
  return new Blob([zipStore(files)], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

export function downloadPptx(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
