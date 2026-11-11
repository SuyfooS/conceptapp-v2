// A one-page PDF for the chat demo's files (C5), written here in a few lines
// rather than shipped as a file: a page with one line of Latin text, its
// cross-reference table counted to the byte. Its data URL downloads as a real
// PDF from the demo's chips, with no request and nothing stored.

/** A minimal valid PDF whose one page says `text` (ASCII, no parentheses). */
export function demoPdf(text: string): string {
  const stream = `BT /F1 24 Tf 72 760 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

/** The demo's PDF as an address a chip downloads from. */
export function demoPdfHref(text: string): string {
  return `data:application/pdf;base64,${btoa(demoPdf(text))}`;
}
