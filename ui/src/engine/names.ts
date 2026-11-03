/* A leaderboard name: three letters, none of these. validate/server.mjs keeps its
   own copy of the list, so the server still refuses them from any client. */
export const BANNED_NAMES = new Set([
  "ASS",
  "CUM",
  "FAG",
  "FCK",
  "FUC",
  "FUK",
  "FUQ",
  "JIZ",
  "JZZ",
  "KKK",
  "KYS",
  "NIG",
  "PNS",
  "PRN",
  "SEX",
  "SHT",
  "TIT",
  "VAG",
  "YOU",
]);

export function cleanName(raw: string) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

export function nameOk(name: string) {
  return name.length === 3 && !BANNED_NAMES.has(name);
}
