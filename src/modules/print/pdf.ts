// A very small PDF writer: one full-page JPEG per page. No library, no server.
// Pages are drawn by the browser (so Tamil letters are shaped correctly) and placed here.

export const PAGE_PT = { A4: { w: 595.276, h: 841.89 }, A3: { w: 841.89, h: 1190.551 } } as const;
export type PaperSize = keyof typeof PAGE_PT;

export interface PdfPage {
  /** Page size in points (1/72 inch). */
  w: number;
  h: number;
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  pxW: number;
  pxH: number;
}

const enc = new TextEncoder();

/** Text for the PDF title: UTF-16 so Tamil works. */
function pdfText(s: string): string {
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

export function buildPdf(pages: PdfPage[], title: string): Uint8Array {
  if (!pages.length) throw new Error("A PDF needs at least one page");
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (data: Uint8Array | string) => {
    const b = typeof data === "string" ? enc.encode(data) : data;
    chunks.push(b);
    pos += b.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const infoNo = 3 + pages.length * 3;
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const page = 3 + i * 3;
    const w = p.w.toFixed(2);
    const h = p.h.toFixed(2);
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(page + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[page + 2] = pos;
    push(`${page + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    push(p.jpeg);
    push("\nendstream\nendobj\n");
  });
  obj(infoNo, `<< /Title ${pdfText(title)} /Producer (Nammoor) >>`);

  const xref = pos;
  let table = `xref\n0 ${infoNo + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= infoNo; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${infoNo + 1} /Root 1 0 R /Info ${infoNo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(pos);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
