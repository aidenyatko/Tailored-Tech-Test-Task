export function extractPdfText(buffer: Buffer) {
  const source = buffer.toString("latin1");
  const operands = source.match(/\((?:\\.|[^\\)])*\)/g) ?? [];
  const strings = operands.map((operand) => decodePdfString(operand.slice(1, -1)));
  strings.push(source.replace(/[^\x20-\x7EА-Яа-яЁё]+/g, " "));
  return normalizeSearchText(strings.join(" "));
}

export function normalizeSearchText(value: string) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function decodePdfString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1");
}
