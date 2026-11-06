/** Relative luminance (0 to 1) of a #rrggbb colour. */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White or near-black text, whichever reads better on the given background colour. */
export function readableText(background: string): string {
  return luminance(background) > 0.4 ? "#1d1d1f" : "#ffffff";
}
