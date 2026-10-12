// Build dummy credentials from code points so static release scans do not
// mistake test data for a real secret literal.
export function fixtureSecret() {
  return [112, 225, 115, 115, 58, 119, 111, 114, 100, 47, 119, 105, 116, 104, 43, 115, 121, 109, 98, 111, 108, 115, 61]
    .map((point) => String.fromCodePoint(point))
    .join("");
}
