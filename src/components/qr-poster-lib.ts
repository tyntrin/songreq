export const POSTER_W = 1748; // A5 at 300 dpi
export const POSTER_H = 2480;

export function publicSetlistUrl(appUrl: string, publicId: string): string {
  return `${appUrl.replace(/\/+$/, "")}/r/${publicId}`;
}

export type PosterLayout = {
  headingY: number;
  subheadingY: number;
  qrBox: { x: number; y: number; size: number; radius: number; padding: number };
  nameY: number;
  footerY: number;
};

/** Pure geometry for the poster canvas (baseline y positions, QR white box). */
export function posterLayout(): PosterLayout {
  const size = 1100;
  const y = 700;
  return {
    headingY: 400,
    subheadingY: 500,
    qrBox: { x: (POSTER_W - size) / 2, y, size, radius: 70, padding: 80 },
    nameY: y + size + 220,
    footerY: POSTER_H - 200,
  };
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "setlist";
}
