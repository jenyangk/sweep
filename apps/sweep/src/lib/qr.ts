// QR code rendering for the pairing flow.
//
// qrcode-generator is a tiny dependency-free QR encoder (~9 kB). It is
// statically imported because the pairing panel is part of the initial
// page (the QR must appear immediately when "Pair device" is clicked);
// jsqr (the scanner) stays a dynamic import in scan.ts.
//
// The QR encodes a join URL built by buildJoinUrl in sync.ts; ticket #3
// will add an AES key to that payload and this module renders it unchanged.

import qrcode from "qrcode-generator";

const CELL_SIZE = 4;
const MARGIN = 2;

// Render `text` as a QR code SVG element. The SVG is produced with a
// white background plate so it scans correctly in dark theme; the caller
// styles the container (border radius, padding).
export function renderQrSvg(text: string): SVGSVGElement {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${CELL_SIZE * (qr.getModuleCount() + 2 * MARGIN)} ${CELL_SIZE * (qr.getModuleCount() + 2 * MARGIN)}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "QR code to scan with your paired device");
  // qrcode-generator's SVG has a fixed white background rect + black
  // modules; drop its inner elements and rebuild against the theme.
  const inner = new DOMParser().parseFromString(
    qr.createSvgTag({ cellSize: CELL_SIZE, margin: MARGIN, scalable: false }),
    "image/svg+xml",
  ).documentElement;
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "#ffffff");
  const path = inner.querySelector("path");
  if (path) {
    path.setAttribute("fill", "#000000");
    svg.append(bg, path.cloneNode(true));
  }
  return svg;
}
