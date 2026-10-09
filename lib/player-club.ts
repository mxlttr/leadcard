export function normalizePlayerName(value: string) {
  const normalized = value
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^a-z0-9, ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.includes(",")) {
    const [lastName, firstName] = normalized.split(",", 2);
    return `${firstName.trim()} ${lastName.trim()}`;
  }

  return normalized;
}

export function formatPlayerDisplayName(value: string) {
  const commaIndex = value.indexOf(",");

  if (commaIndex < 0) {
    return value;
  }

  const familyName = value.slice(0, commaIndex).trim();
  const givenNames = value.slice(commaIndex + 1).trim();
  return givenNames ? `${givenNames} ${familyName}` : familyName;
}

export function playerClubKey(division: string, name: string) {
  return `${normalizePlayerName(division)}|${normalizePlayerName(name)}`;
}
