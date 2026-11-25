// Drawing instructions. The poster and the story book are first worked out as a list of
// these (pure, testable), then painted on a canvas in the browser. Units are points.

export type Cmd =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lw?: number; r?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; color: string; lw: number }
  | { t: "text"; x: number; y: number; s: string; size: number; bold?: boolean; color: string; align?: "left" | "center" | "right" }
  | { t: "img"; x: number; y: number; w: number; h: number; ref: string };

export interface PageCmds {
  w: number;
  h: number;
  cmds: Cmd[];
}

/** Width of a text in points for a font size. The browser gives the real one, tests give a fake one. */
export type Measure = (text: string, size: number, bold?: boolean) => number;

/** Break text into lines that fit. Keeps paragraphs, never loses a word, breaks very long words. */
export function wrapLines(text: string, maxW: number, size: number, measure: Measure, bold = false): string[] {
  const lines: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let cur = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (measure(next, size, bold) <= maxW) {
        cur = next;
        continue;
      }
      if (cur) lines.push(cur);
      cur = word;
      // a single word wider than the line: cut it by letters
      while (measure(cur, size, bold) > maxW && [...cur].length > 1) {
        const chars = [...cur];
        let n = chars.length - 1;
        while (n > 1 && measure(chars.slice(0, n).join(""), size, bold) > maxW) n--;
        lines.push(chars.slice(0, n).join(""));
        cur = chars.slice(n).join("");
      }
    }
    lines.push(cur);
  }
  return lines;
}

/** One line cut to a width, with "…" if it had to be shortened. */
export function fitText(text: string, maxW: number, size: number, measure: Measure, bold = false): string {
  if (measure(text, size, bold) <= maxW) return text;
  const chars = [...text];
  let n = chars.length;
  while (n > 1 && measure(chars.slice(0, n).join("") + "…", size, bold) > maxW) n--;
  return chars.slice(0, n).join("").trimEnd() + "…";
}
