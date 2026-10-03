const HONORIFICS = ['mr', 'mrs', 'ms', 'dr', 'shri', 'smt', 'kumari', 'sri'];

export function normaliseName(name: string): string {
  let normalized = name.toLowerCase();

  normalized = normalized.normalize('NFKD').replace(/[̀-ͯ]/g, '');

  for (const honorific of HONORIFICS) {
    const regex = new RegExp(`\\b${honorific}\\.?\\s+`, 'g');
    normalized = normalized.replace(regex, '');
  }

  normalized = normalized.replace(/[^\w\s-]/g, '');

  normalized = normalized.replace(/-/g, ' ');

  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

export function jaroWinkler(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) {
    return 1;
  }

  const jaroScore = jaro(aLower, bLower);

  const prefixLen = Math.min(
    4,
    Math.min(aLower.length, bLower.length),
    commonPrefixLength(aLower, bLower)
  );

  return jaroScore + prefixLen * 0.1 * (1 - jaroScore);
}

function jaro(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;

  if (lenA === 0 && lenB === 0) {
    return 1;
  }
  if (lenA === 0 || lenB === 0) {
    return 0;
  }

  const { matches, transpositions } = findMatches(a, b);

  if (matches === 0) {
    return 0;
  }

  return (matches / lenA + matches / lenB + (matches - transpositions / 2) / matches) / 3;
}

function findMatches(a: string, b: string): { matches: number; transpositions: number } {
  const lenA = a.length;
  const lenB = b.length;
  const matchDistance = Math.floor(Math.max(lenA, lenB) / 2) - 1;

  const aMatched = new Array(lenA).fill(false);
  const bMatched = new Array(lenB).fill(false);
  let matches = 0;

  for (let i = 0; i < lenA; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, lenB);

    for (let j = start; j < end; j++) {
      if (bMatched[j] || a[i] !== b[j]) {
        continue;
      }
      aMatched[i] = true;
      bMatched[j] = true;
      matches++;
      break;
    }
  }

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < lenA; i++) {
    if (!aMatched[i]) {
      continue;
    }
    while (!bMatched[k]) {
      k++;
    }
    if (a[i] !== b[k]) {
      transpositions++;
    }
    k++;
  }

  return { matches, transpositions };
}

function commonPrefixLength(a: string, b: string): number {
  let len = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) {
      len++;
    } else {
      break;
    }
  }
  return len;
}
