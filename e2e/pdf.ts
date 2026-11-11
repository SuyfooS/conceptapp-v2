/**
 * A PDF for the chat tests (C5), written here rather than downloaded: one
 * page with one line of text, its cross-reference table counted to the byte,
 * and, when `size` asks for more, a comment after the header that pads it
 * out to about that many bytes (a reader skips it). Larger than the 1 MB a server action takes, it
 * can only reach Storage through its signed upload.
 */
export function minimalPdf(text: string, size = 0): Buffer {
  const stream = `BT /F1 24 Tf 72 760 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const build = (pad: number) => {
    let body = "%PDF-1.4\n";
    if (pad > 0) body += `%${"0".repeat(pad)}\n`;
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
  };
  const plain = build(0);
  // The comment's own "%" and line end; the offsets keep their width, and
  // only the last one, unpadded, may grow by a few digits.
  const pad = Math.max(0, size - plain.length - 2);
  return Buffer.from(pad > 0 ? build(pad) : plain, "latin1");
}

/** Bytes that say they are a PDF by their name and type, and are a web page. */
export function fakePdf(): Buffer {
  return Buffer.from(
    "<!doctype html><title>not a PDF</title><script>document.title = 'ran';</script>\n",
    "utf8",
  );
}
