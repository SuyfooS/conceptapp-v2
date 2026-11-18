// An illustrated stand-in for a photo on a list, for the demos and the
// gallery: a clean kitchen drawn as shapes, nothing from a camera. A data URL,
// so it shows like a stored photo without a request, as ./portraits does.

const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef2f4"/><stop offset="1" stop-color="#d9e1e6"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9d2d8"/><stop offset="1" stop-color="#9eabb4"/></linearGradient></defs><rect width="400" height="300" fill="url(#w)"/>${body}</svg>`,
  )}`;

/** A steel counter under a hood, a clean shelf and a tiled wall. */
const kitchen =
  // Tiles
  `<g fill="none" stroke="#c4ced5" stroke-width="2">${Array.from(
    { length: 9 },
    (_, row) => `<line x1="0" y1="${row * 22}" x2="400" y2="${row * 22}"/>`,
  ).join("")}${Array.from(
    { length: 11 },
    (_, col) => `<line x1="${col * 40}" y1="0" x2="${col * 40}" y2="190"/>`,
  ).join("")}</g>` +
  // The hood
  `<path d="M150 0h100v40l30 40H120l30-40z" fill="url(#s)"/>` +
  `<rect x="118" y="78" width="164" height="8" rx="3" fill="#8b98a2"/>` +
  // A shelf with jars
  `<rect x="300" y="70" width="90" height="6" rx="2" fill="#8b98a2"/>` +
  `<rect x="308" y="42" width="18" height="28" rx="4" fill="#e7b25c"/>` +
  `<rect x="332" y="48" width="18" height="22" rx="4" fill="#7fb38a"/>` +
  `<rect x="356" y="38" width="22" height="32" rx="4" fill="#d9785f"/>` +
  // The counter
  `<rect x="0" y="190" width="400" height="110" fill="url(#s)"/>` +
  `<rect x="0" y="184" width="400" height="12" fill="#b6c1c8"/>` +
  `<rect x="140" y="150" width="120" height="34" rx="6" fill="#5f6c75"/>` +
  `<circle cx="170" cy="167" r="10" fill="#3f4a52"/>` +
  `<circle cx="230" cy="167" r="10" fill="#3f4a52"/>` +
  // Doors under it
  `<g fill="none" stroke="#8b98a2" stroke-width="3"><rect x="20" y="210" width="110" height="74" rx="6"/><rect x="145" y="210" width="110" height="74" rx="6"/><rect x="270" y="210" width="110" height="74" rx="6"/></g>` +
  // A shine on the steel
  `<path d="M30 200l60 0-20 6-60 0z" fill="#ffffff" opacity="0.5"/>`;

export const listPhotos = {
  kitchen: svg(kitchen),
};
