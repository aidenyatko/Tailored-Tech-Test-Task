import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const outputPath = join(root, "docs", "test-cases.xlsx");

const rows = [
  ["ID", "Area", "Preconditions", "Steps", "Expected Result", "Priority", "Automation", "Status"],
  ["TC-001", "Auth", "App is running", "Open app", "Login screen is shown with demo accounts", "High", "Manual", "Ready"],
  ["TC-002", "Auth", "App is running", "Login as owner@acme.test / owner123", "Owner enters workspace", "High", "Automated", "Ready"],
  ["TC-003", "Auth", "App is running", "Login with wrong password", "Error message is shown and workspace is not opened", "High", "Manual", "Ready"],
  ["TC-004", "Auth", "App is running", "Open create-user mode from login screen and submit valid data", "New user is created, signed in and shown in the top bar", "High", "Automated", "Ready"],
  ["TC-005", "Access", "Owner is logged in", "Right-click data room and open Manage access", "Access dialog opens from the context menu", "High", "Automated", "Ready"],
  ["TC-006", "Access", "Owner is logged in", "Search Val in the access dialog", "Only matching users are shown", "High", "Automated", "Ready"],
  ["TC-007", "Access", "Owner is logged in", "Set Available to everyone to viewer", "Right panel shows Everyone with VIEWER role", "High", "Automated", "Ready"],
  ["TC-008", "Access", "Public viewer access is enabled", "Create a new user and open data room list", "New user can see the public data room as VIEWER", "High", "Manual", "Ready"],
  ["TC-009", "Access", "Owner is logged in", "Grant viewer role to viewer user", "Viewer can see the data room in their list", "High", "Manual", "Ready"],
  ["TC-010", "Access", "Viewer is logged in", "Open shared data room", "Viewer can browse and preview files", "High", "Manual", "Ready"],
  ["TC-011", "Access", "Viewer is logged in", "Try to create folder or upload PDF", "Write controls are disabled or API returns forbidden", "High", "Manual", "Ready"],
  ["TC-012", "Access", "Owner is logged in", "Grant editor role to editor user", "Editor can create, rename, move and delete files/folders", "High", "Manual", "Ready"],
  ["TC-013", "Access", "Owner is logged in", "Try to remove owner access", "System rejects owner access change", "High", "Manual", "Ready"],
  ["TC-014", "Data rooms", "Owner is logged in", "Create a new data room", "New data room appears in sidebar with OWNER role", "High", "Automated", "Ready"],
  ["TC-015", "Data rooms", "Owner is logged in", "Rename data room", "New name is shown in sidebar and header", "Medium", "Manual", "Ready"],
  ["TC-016", "Data rooms", "Owner is logged in", "Delete data room", "Data room, items, access records and blobs are removed", "High", "Manual", "Ready"],
  ["TC-017", "Folders", "Editable data room is selected", "Create folder in root", "Folder appears in the table", "High", "Automated", "Ready"],
  ["TC-018", "Folders", "Folder exists", "Open folder and create nested folder", "Nested folder is created under parent", "High", "Manual", "Ready"],
  ["TC-019", "Folders", "Nested folder is open", "Use breadcrumb to return to root", "Root folder contents are displayed", "Medium", "Manual", "Ready"],
  ["TC-020", "Folders", "Folder exists", "Rename folder", "Folder row shows new name", "Medium", "Manual", "Ready"],
  ["TC-021", "Folders", "Folder has nested files and folders", "Delete top-level folder", "All descendants and file blobs are deleted", "High", "Manual", "Ready"],
  ["TC-022", "Files", "Editable data room is selected", "Upload a valid PDF", "PDF row appears and blob is stored", "High", "Manual", "Ready"],
  ["TC-023", "Files", "Editable data room is selected", "Upload Dmytro_Kiselov_Full-Stack_Developer.pdf from test-assets/resumes", "Resume PDF row appears and opens in preview", "High", "Manual", "Ready"],
  ["TC-024", "Files", "Editable data room is selected", "Upload every PDF from test-assets/resumes", "All resume versions upload successfully", "High", "Manual", "Ready"],
  ["TC-025", "Files", "Editable data room is selected", "Upload non-PDF file", "Upload is rejected", "High", "Manual", "Ready"],
  ["TC-026", "Files", "Report.pdf already exists", "Upload another Report.pdf", "Second file receives safe duplicate name", "Medium", "Manual", "Ready"],
  ["TC-027", "Files", "PDF exists", "Select PDF row", "Right details panel shows metadata and preview", "High", "Manual", "Ready"],
  ["TC-028", "Files", "PDF exists", "Rename PDF", "File row and details panel show new name", "Medium", "Manual", "Ready"],
  ["TC-029", "Files", "PDF exists", "Delete PDF", "File row disappears and blob content is unavailable", "High", "Manual", "Ready"],
  ["TC-030", "Move", "Two folders exist", "Move file from root into folder", "File is shown inside target folder only", "High", "Manual", "Ready"],
  ["TC-031", "Move", "Nested folders exist", "Move folder into another folder", "Folder path updates and breadcrumb works", "High", "Manual", "Ready"],
  ["TC-032", "Move", "Parent and child folders exist", "Try to move parent into child", "System rejects invalid move", "High", "Manual", "Ready"],
  ["TC-033", "Search", "PDF with text content is uploaded", "Search by visible file name", "Matching file is shown", "High", "Automated", "Ready"],
  ["TC-034", "Search", "PDF with indexed text is uploaded", "Search by a word inside PDF content", "Matching file is shown", "High", "Manual", "Ready"],
  ["TC-035", "Search", "Files/folders exist", "Search for missing term", "Empty state is shown", "Medium", "Automated", "Ready"],
  ["TC-036", "Viewer", "PDF is selected", "Click Open in data room viewer", "Fullscreen modal opens inside app UI", "High", "Manual", "Ready"],
  ["TC-037", "Viewer", "Fullscreen viewer is open", "Close viewer", "User returns to workspace without navigation loss", "Medium", "Manual", "Ready"],
  ["TC-038", "PostgreSQL", "Docker stack is running", "Restart app container", "Data rooms, access and item metadata remain in PostgreSQL", "High", "Manual", "Ready"],
  ["TC-039", "Blob storage", "PDF was uploaded", "Restart app container", "PDF content remains available from upload volume", "High", "Manual", "Ready"],
  ["TC-040", "Docker", "Docker Desktop is running", "Run docker compose up -d --build", "Postgres and app start with one command", "High", "Manual", "Ready"],
  ["TC-041", "CI", "Feature branch is pushed", "Open GitHub Actions", "Lint, typecheck, tests and build pass", "High", "Manual", "Ready"]
];

const files = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Data Room Test Cases</dc:title>
  <dc:creator>Codex</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-08-02T00:00:00Z</dcterms:created>
</cp:coreProperties>`,
  "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Codex</Application>
</Properties>`,
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Test Cases" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFCEE09"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
  "xl/worksheets/sheet1.xml": worksheetXml(rows)
};

const table = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, zip(files));
console.log(outputPath);

function worksheetXml(data) {
  const body = data.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ' s="1"' : "";
      return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="10" customWidth="1"/>
    <col min="2" max="2" width="18" customWidth="1"/>
    <col min="3" max="3" width="28" customWidth="1"/>
    <col min="4" max="4" width="42" customWidth="1"/>
    <col min="5" max="5" width="48" customWidth="1"/>
    <col min="6" max="8" width="14" customWidth="1"/>
  </cols>
  <sheetData>${body}</sheetData>
  <autoFilter ref="A1:H${data.length}"/>
</worksheet>`;
}

function zip(fileMap) {
  const entries = Object.entries(fileMap).map(([name, content]) => ({
    name,
    data: Buffer.from(content, "utf8")
  }));
  let offset = 0;
  const localParts = [];
  const centralParts = [];

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, entry.data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function columnName(index) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
