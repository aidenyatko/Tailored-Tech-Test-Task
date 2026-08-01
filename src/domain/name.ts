import { DataRoomError } from "./errors";

const MAX_NAME_LENGTH = 120;

export function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function nameKey(name: string) {
  return normalizeName(name).toLocaleLowerCase();
}

export function assertValidName(name: string) {
  const normalized = normalizeName(name);

  if (!normalized) {
    throw new DataRoomError("INVALID_NAME", "Name is required.");
  }

  if (normalized.length > MAX_NAME_LENGTH) {
    throw new DataRoomError("INVALID_NAME", "Name must be 120 characters or fewer.");
  }

  return normalized;
}

export function ensureUniqueName(
  requestedName: string,
  existingNames: string[],
  selfName?: string
) {
  const normalized = assertValidName(requestedName);
  const requestedKey = nameKey(normalized);
  const selfKey = selfName ? nameKey(selfName) : null;
  const hasDuplicate = existingNames.some((name) => nameKey(name) === requestedKey && nameKey(name) !== selfKey);

  if (hasDuplicate) {
    throw new DataRoomError("DUPLICATE_NAME", "An item with this name already exists here.");
  }

  return normalized;
}

export function createUniqueName(requestedName: string, existingNames: string[]) {
  const normalized = assertValidName(requestedName);
  const used = new Set(existingNames.map(nameKey));

  if (!used.has(nameKey(normalized))) {
    return normalized;
  }

  const { base, extension } = splitExtension(normalized);
  let counter = 1;

  while (used.has(nameKey(`${base} (${counter})${extension}`))) {
    counter += 1;
  }

  return `${base} (${counter})${extension}`;
}

function splitExtension(name: string) {
  const dotIndex = name.lastIndexOf(".");

  if (dotIndex <= 0 || dotIndex === name.length - 1) {
    return { base: name, extension: "" };
  }

  return {
    base: name.slice(0, dotIndex),
    extension: name.slice(dotIndex)
  };
}
