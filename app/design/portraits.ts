// Illustrated stand-ins for profile photos on the demos and the gallery:
// fictional people drawn as shapes, no real faces, nothing from a camera.
// Drawn from the approved profile mockup (issue #82). As data URLs, so they
// show like a stored photo without a request.

const svg = (body: string, from: string, to: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/>${body}</svg>`,
  )}`;

/** Long hair, a dark top with a collar. */
const longHair = (hair: string, skin: string, neck: string, top: string) =>
  `<path d="M27 46c0-15 9-26 21-26s21 11 21 26v20c0 5-3 8-8 8H35c-5 0-8-3-8-8z" fill="${hair}"/>` +
  `<path d="M10 98c2-17 15-27 38-27s36 10 38 27z" fill="${top}"/>` +
  `<path d="M42 58h12v11c0 3.5-2.7 6-6 6s-6-2.5-6-6z" fill="${neck}"/>` +
  `<ellipse cx="48" cy="44" rx="13.5" ry="16" fill="${skin}"/>` +
  `<path d="M34.2 43c.6-11.5 6.6-18 14.3-18 8.4 0 14 6.6 13.8 16.4-7.2-1.3-13.4-5.2-16.8-10.6-2.2 5.6-6 9.6-11.3 12.2z" fill="${hair}"/>` +
  `<path d="M37 71.5 48 81l11-9.5" fill="none" stroke="#f3f0ea" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;

/** Short hair and a beard, a green top. */
const beard =
  `<path d="M10 98c2-17 15-27 38-27s36 10 38 27z" fill="#2c4a3b"/>` +
  `<path d="M42 57h12v12c0 3.5-2.7 6-6 6s-6-2.5-6-6z" fill="#b97f5b"/>` +
  `<ellipse cx="48" cy="43" rx="14" ry="16.5" fill="#cf9470"/>` +
  `<path d="M34.3 41.5c-1.2-10.6 5.4-17.8 13.9-17.8 9 0 15.2 6.6 13.6 17.4-2.5-4.4-7.3-6.9-13.7-6.9-6.3 0-11.2 2.6-13.8 7.3z" fill="#241a15"/>` +
  `<path d="M34.6 45.5c.8 10.6 6 16.4 13.4 16.4s12.6-5.8 13.4-16.4c-2.2 4-6.5 6.2-13.4 6.2s-11.2-2.2-13.4-6.2z" fill="#241a15" fill-opacity=".88"/>` +
  `<path d="M40 73v8M56 73v8" stroke="#e9e3d8" stroke-width="2.4" stroke-linecap="round"/>`;

export const portraits = {
  shiran: svg(
    longHair("#5a3a2e", "#e9b892", "#d39b78", "#3b3f6b"),
    "#f1d3b8",
    "#c98f6b",
  ),
  maya: svg(
    longHair("#3b2621", "#e7b18c", "#cf9572", "#25272e"),
    "#cdbff1",
    "#8e7bcb",
  ),
  yoav: svg(beard, "#bfe0cf", "#5e9c80"),
} as const;
