/** Small shared helpers, without a dependency on either styles or rendering. */
export const MM = 72 / 25.4;
export const pt = (n: number): string => `${Number(n.toFixed(4))}pt`;
export const literal = (text: string): string => JSON.stringify(text).replace(/\\u([0-9a-fA-F]{4})/g, "\\u{$1}");
