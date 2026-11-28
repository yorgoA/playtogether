// Runs on the server and on phones. Cards are an element and a number, like E4, or G (gust) or C (calm).
export const elements = { E: 'Ember', T: 'Tide', D: 'Dusk', F: 'Frost' } as const;
export type Element = keyof typeof elements;
export const highest = 8;
export const stormLimit = 5;
export const isPower = (card: string) => card === 'G' || card === 'C';
// Numbers run in a circle, so 8 and 1 are neighbours.
function neighbours(a: string, b: string) {
  const gap = Math.abs(Number(a[1]) - Number(b[1]));
  return gap === 1 || gap === highest - 1;
}
// A turn's first card shares the pile's element or is its neighbour. Later ones must be neighbours.
export function fits(card: string, top: string, streak: boolean) {
  return !isPower(card) && (neighbours(card, top) || (!streak && card[0] === top[0]));
}
