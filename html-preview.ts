// HTML scripts run in an opaque-origin iframe. Media is disabled to keep HTML
// previews off the desktop's native video path; open media files separately.
export function htmlPreviewDocument(html: string, assetBase: string) {
  const escaped = assetBase
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="media-src 'none'; object-src 'none'; frame-src 'none'; base-uri ${escaped}"><base href="${escaped}">${html}`;
}
