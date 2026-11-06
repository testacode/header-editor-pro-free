// Chrome Web Store promo tiles, in the same look as the store screenshots:
// small (440×280, icon + name, no UI — too small to read one) and marquee
// (1400×560, caption + the real popup). Both rendered as JPEG: no alpha.

export const PROMO_TILES = [
  { file: 'promo-small', width: 440, height: 280, html: smallTile },
  { file: 'promo-marquee', width: 1400, height: 560, html: marqueeTile },
];

const BACKGROUND = 'linear-gradient(135deg,#1b2a1c 0%,#14181f 55%,#1d1730 100%)';
const FEATURES = 'Headers · Redirects · Cookies · Profiles';

function page(width, height, body) {
  return `<!doctype html><html><body style="margin:0;width:${width}px;height:${height}px;
    box-sizing:border-box;font-family:system-ui,sans-serif;background:${BACKGROUND};color:#fff;
    display:flex;align-items:center">${body}</body></html>`;
}

function smallTile({ iconPng }) {
  return page(
    440,
    280,
    `<div style="width:100%;text-align:center">
      <img src="data:image/png;base64,${iconPng}" width="72" height="72">
      <div style="font-size:30px;font-weight:800;line-height:1.1;margin-top:14px">Header Editor Pro</div>
      <div style="color:#4caf50;font-weight:700;letter-spacing:.12em;font-size:14px;margin-top:6px">FREE</div>
      <div style="color:#c9d1d9;font-size:15px;margin-top:14px">${FEATURES}</div>
    </div>`
  );
}

function marqueeTile({ iconPng, popupPng }) {
  return page(
    1400,
    560,
    `<div style="flex:1;padding-left:96px">
      <div style="display:flex;align-items:center;gap:18px">
        <img src="data:image/png;base64,${iconPng}" width="64" height="64">
        <div style="color:#4caf50;font-weight:700;letter-spacing:.08em;font-size:16px">HEADER EDITOR PRO — FREE</div>
      </div>
      <h1 style="font-size:54px;line-height:1.08;margin:26px 0 18px">Every HTTP tweak,<br>one click away</h1>
      <p style="font-size:24px;color:#c9d1d9;margin:0">${FEATURES} — free and open source</p>
    </div>
    <img src="data:image/png;base64,${popupPng}" width="480" height="480"
      style="margin-right:96px;border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,.55)">`
  );
}
