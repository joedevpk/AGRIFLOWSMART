#!/usr/bin/env node
/**
 * Génère l'identité visuelle d'AgriFlow RDC (SVG vectoriels + PNG) à partir d'UNE géométrie : src/components/brand/mark.json.
 * Le texte du logo est converti en tracés (police Manrope, déjà utilisée par le site) : le logo ne dépend d'aucune police installée.
 * Usage : node scripts/build-brand.mjs        (les fichiers générés sont versionnés ; relancer seulement pour modifier le logo)
 *
 * Concept : une feuille (production locale, croissance) posée sur une courbe qui file vers un point (circulation des produits du
 * producteur vers le marché) ; une petite étoile dorée rappelle discrètement le drapeau de la RDC. Palette = celle du site.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');
const M = JSON.parse(readFileSync('src/components/brand/mark.json', 'utf8'));
const C = M.colors;
const font = (w) => { const b = readFileSync(`node_modules/@fontsource/manrope/files/manrope-latin-${w}-normal.woff`); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const F800 = font(800), F700 = font(700);

const SLOGAN = 'Du producteur au marché, simplement.';
const text = (f, str, x, y, size, fill, letterSpacing = 0) => {
  let cx = x; const parts = [];
  for (const ch of str) {
    const g = f.charToGlyph(ch);
    parts.push(g.getPath(cx, y, size).toPathData(2));
    cx += g.advanceWidth * (size / f.unitsPerEm) + letterSpacing;
  }
  return { svg: `<path fill="${fill}" d="${parts.join('')}"/>`, width: cx - x - letterSpacing };
};

/** Glyphe seul (feuille + courbe + point + étoile), coordonnées 64×64. */
const glyph = ({ leaf = C.fresh, vein = C.forest, flow = C.sage, node = C.gold, star = C.gold, mono = false } = {}) => mono
  ? `<mask id="v"><rect width="64" height="64" fill="#fff"/><path d="${M.vein}" stroke="#000" stroke-width="2" stroke-linecap="round" fill="none"/></mask>
<path mask="url(#v)" fill="currentColor" d="${M.leaf}"/><path d="${M.flow}" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none"/><circle cx="${M.node.cx}" cy="${M.node.cy}" r="${M.node.r}" fill="currentColor"/><path fill="currentColor" d="${M.star}"/>`
  : `<path fill="${leaf}" d="${M.leaf}"/><path d="${M.vein}" stroke="${vein}" stroke-width="2" stroke-linecap="round" fill="none"/><path d="${M.flow}" stroke="${flow}" stroke-width="3.2" stroke-linecap="round" fill="none"/><circle cx="${M.node.cx}" cy="${M.node.cy}" r="${M.node.r}" fill="${node}"/><path fill="${star}" d="${M.star}"/>`;

const svg = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
const markSquare = (bg = C.forest, rounded = true) => `<rect width="64" height="64" rx="${rounded ? M.radius : 0}" fill="${bg}"/>${glyph()}`;

/** Logo horizontal : marque + « AgriFlow » + « RDC ». */
function horizontal({ dark = false, tagline = false, mono = false } = {}) {
  const ink = mono ? 'currentColor' : dark ? C.white : C.forest;
  const flowc = mono ? 'currentColor' : dark ? C.sage : C.agri;
  const rdc = mono ? 'currentColor' : dark ? C.gold : C.harvest;
  const bg = dark ? '#1D4A29' : C.forest;
  const x0 = 64 + 14;
  const agri = text(F800, 'Agri', x0, 36, 34, ink);
  const flow = text(F800, 'Flow', x0 + agri.width, 36, 34, flowc);
  const r = text(F700, 'RDC', x0 + 1, 58, 12.5, rdc, 3.2);
  const width = Math.ceil(x0 + agri.width + flow.width + 2);
  const mark = mono ? `<g color="currentColor">${glyph({ mono: true })}</g>` : `<rect width="64" height="64" rx="${M.radius}" fill="${bg}"/>${glyph()}`;
  let body = `${mark}${agri.svg}${flow.svg}${r.svg}`; let h = 64;
  if (tagline) { const t = text(F700, SLOGAN, 0, 90, 13, mono ? 'currentColor' : dark ? C.sage : C.agri, 0.2); body += t.svg; h = 100; return svg(Math.max(width, Math.ceil(t.width)), h, body, `AgriFlow RDC — ${SLOGAN}`); }
  return svg(width, h, body, 'AgriFlow RDC');
}

mkdirSync('public/brand', { recursive: true }); mkdirSync('assets', { recursive: true });
const out = {
  'public/brand/agriflow-logo.svg': horizontal(),
  'public/brand/agriflow-logo-dark.svg': horizontal({ dark: true }),
  'public/brand/agriflow-logo-tagline.svg': horizontal({ tagline: true }),
  'public/brand/agriflow-logo-mono.svg': horizontal({ mono: true }),
  'public/brand/agriflow-mark.svg': svg(64, 64, markSquare(), 'AgriFlow RDC'),
  'public/brand/agriflow-mark-glyph.svg': svg(64, 64, glyph(), 'AgriFlow RDC'),
  'public/brand/agriflow-mark-mono.svg': svg(64, 64, `<g color="currentColor">${glyph({ mono: true })}</g>`, 'AgriFlow RDC'),
  'public/favicon.svg': svg(64, 64, markSquare(), 'AgriFlow RDC'),
};
for (const [p, s] of Object.entries(out)) writeFileSync(p, s);

const vbw = (s) => Number(/viewBox="0 0 (\d+)/.exec(s)[1]);
const png = async (svgStr, file, w, h) => sharp(Buffer.from(svgStr), { density: 384 }).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(file);
await png(out['public/brand/agriflow-mark.svg'], 'public/brand/agriflow-mark-512.png', 512, 512);
await png(out['public/brand/agriflow-logo.svg'], 'public/brand/agriflow-logo-1200.png', 1200, Math.round(1200 * 64 / vbw(out['public/brand/agriflow-logo.svg'])));
await png(out['public/brand/agriflow-logo-dark.svg'], 'public/brand/agriflow-logo-dark-1200.png', 1200, Math.round(1200 * 64 / vbw(out['public/brand/agriflow-logo-dark.svg'])));
await png(svg(64, 64, markSquare(C.forest, true), 'AgriFlow RDC'), 'public/favicon-32.png', 32, 32);
await png(svg(64, 64, markSquare(C.forest, false), 'AgriFlow RDC'), 'public/apple-touch-icon.png', 180, 180);

// Image de partage (1200×630) : logo clair sur fond forêt + slogan.
{
  const lg = horizontal({ dark: true }); const w = vbw(lg);
  const inner = lg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>.*?<\/title>/, '');
  const s = 3.2; const lx = (1200 - w * s) / 2;
  const tg = text(F700, SLOGAN, 0, 0, 34, C.sage, 0.6);
  writeFileSync('public/brand/og-image.svg', svg(1200, 630, `<rect width="1200" height="630" fill="${C.forest}"/><g transform="translate(${lx} 190) scale(${s})">${inner}</g><g transform="translate(${(1200 - tg.width) / 2} 470)">${tg.svg}</g><rect y="618" width="1200" height="12" fill="${C.harvest}"/>`, 'AgriFlow RDC'));
  await sharp(Buffer.from(readFileSync('public/brand/og-image.svg')), { density: 144 }).resize(1200, 630).png().toFile('public/brand/og-image.png');
}

// Sources pour @capacitor/assets (icônes Android adaptatives, iOS, écrans de lancement).
const place = (inner, canvas, scale, bg) => { const s = (canvas * scale) / 64; const t = (canvas - 64 * s) / 2; return svg(canvas, canvas, `${bg ? `<rect width="${canvas}" height="${canvas}" fill="${bg}"/>` : ''}<g transform="translate(${t} ${t}) scale(${s})">${inner}</g>`, 'AgriFlow RDC'); };
await png(place(glyph(), 1024, 0.78, C.forest), 'assets/icon-only.png', 1024, 1024);
await png(place(glyph(), 1024, 0.56), 'assets/icon-foreground.png', 1024, 1024);
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: C.forest } }).png().toFile('assets/icon-background.png');
for (const name of ['splash.png', 'splash-dark.png']) {
  const size = 2732; const g = (size * 0.2) / 64;
  const a = text(F800, 'Agri', 0, 0, 150, C.white), f = text(F800, 'Flow', a.width, 0, 150, C.sage), r = text(F700, 'RDC', 0, 0, 52, C.gold, 14);
  const total = a.width + f.width;
  const body = `<rect width="${size}" height="${size}" fill="${C.forest}"/><g transform="translate(${(size - 64 * g) / 2} ${size * 0.30}) scale(${g})">${glyph()}</g><g transform="translate(${(size - total) / 2} ${size * 0.30 + 64 * g + 190})">${a.svg}${f.svg}</g><g transform="translate(${(size - r.width) / 2} ${size * 0.30 + 64 * g + 270})">${r.svg}</g>`;
  await sharp(Buffer.from(svg(size, size, body, 'AgriFlow RDC')), { density: 72 }).resize(size, size).png().toFile(`assets/${name}`);
}
console.log('✔ identité générée :', Object.keys(out).length, 'SVG, PNG et sources Android/iOS');
