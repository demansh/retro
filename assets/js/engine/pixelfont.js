const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;
const GLYPH_SPACING = 1;

const GLYPHS = {
  0: "111101101101111",
  1: "010110010010111",
  2: "111001111100111",
  3: "111001111001111",
  4: "101101111001001",
  5: "111100111001111",
  6: "111100111101111",
  7: "111001001001001",
  8: "111101111101111",
  9: "111101111001111",
  A: "010101111101101",
  B: "110101110101110",
  C: "011100100100011",
  D: "110101101101110",
  E: "111100110100111",
  F: "111100110100100",
  G: "011100101101011",
  H: "101101111101101",
  I: "111010010010111",
  J: "001001001101010",
  K: "101101110101101",
  L: "100100100100111",
  M: "101111111101101",
  N: "110101101101101",
  O: "010101101101010",
  P: "110101110100100",
  Q: "010101101110011",
  R: "110101110101101",
  S: "011100010001110",
  T: "111010010010010",
  U: "101101101101111",
  V: "101101101101010",
  W: "101101111111101",
  X: "101101010101101",
  Y: "101101010010010",
  Z: "111001010100111",
  " ": "000000000000000",
  "-": "000000111000000",
  "+": "000010111010000",
  ":": "000010000010000",
  ".": "000000000000010",
  "!": "010010010000010",
  ">": "100010001010100",
  "<": "001010100010001",
  "?": "111001010000010",
  "/": "001001010100100",
  _: "000000000000111",
};

const GLYPH_PIXELS = Object.fromEntries(
  Object.entries(GLYPHS).map(([character, bits]) => [
    character,
    Array.from(bits).flatMap((bit, index) => (bit === "1" ? [[index % GLYPH_WIDTH, Math.floor(index / GLYPH_WIDTH)]] : [])),
  ]),
);

export const LINE_HEIGHT = GLYPH_HEIGHT;

export function measureText(text, scale = 1) {
  return text.length === 0 ? 0 : (text.length * (GLYPH_WIDTH + GLYPH_SPACING) - GLYPH_SPACING) * scale;
}

export function drawText(context, text, x, y, { scale = 1, color = "#fff", align = "left" } = {}) {
  const upperText = String(text).toUpperCase();
  const width = measureText(upperText, scale);
  const offset = align === "center" ? width / 2 : align === "right" ? width : 0;
  let cursorX = Math.round(x - offset);
  const cursorY = Math.round(y);
  context.fillStyle = color;
  for (const character of upperText) {
    const pixels = GLYPH_PIXELS[character] ?? GLYPH_PIXELS["?"];
    for (const [pixelX, pixelY] of pixels) {
      context.fillRect(cursorX + pixelX * scale, cursorY + pixelY * scale, scale, scale);
    }
    cursorX += (GLYPH_WIDTH + GLYPH_SPACING) * scale;
  }
}
