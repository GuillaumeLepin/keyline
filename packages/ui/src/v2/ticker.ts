/**
 * NumberTicker cells. The formatted string is split into characters keyed from the RIGHT, so the
 * units digit is always cell `r0` and keeps its identity when the number grows a digit on the left
 * (CHF 99.80 → CHF 120.00 rolls the existing columns and adds one, instead of re-rendering all).
 */
export type TickerCell = { key: string; char: string; digit: number | null };

export function tickerCells(formatted: string): TickerCell[] {
  const chars = Array.from(formatted);
  return chars.map((char, i) => {
    const fromRight = chars.length - 1 - i;
    const digit = /[0-9]/.test(char) ? Number(char) : null;
    return { key: `r${fromRight}`, char, digit };
  });
}

/** How a column moves from one digit to the next: the shortest roll would be ambiguous on a dial,
 *  so the column always travels the direct way (3 → 7 rolls up four, 7 → 3 rolls down four). */
export function digitOffsetPercent(digit: number): string {
  return `${-digit * 10}%`;
}
