#!/usr/bin/env node
/**
 * Contrôles de sécurité de l'application mobile (Capacitor). Trois modes :
 *   node scripts/mobile-checks.mjs env     avant le build : variables VITE_* valides, aucune URL de test, aucun secret
 *   node scripts/mobile-checks.mjs bundle  après le build : aucun secret dans dist/
 *   node scripts/mobile-checks.mjs native  après `cap sync` : aucune URL de développement dans la configuration native embarquée
 * Sortie non nulle au premier problème. Ne journalise JAMAIS la valeur d'une variable, seulement son nom.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';

const SECRET_NAME = /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|CINETPAY|API_KEY)/i;
const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|.*\.local$)/i;

function jwtRole(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role ?? null; } catch { return null; }
}

function httpsUrl(value) {
  try { const u = new URL(String(value).trim()); return u.protocol === 'https:' && !u.username && !u.password ? u : null; } catch { return null; }
}

/**
 * Variables VITE_* du build, EXACTEMENT comme `vite build` les lit : fichiers `.env`, `.env.local`, `.env.production`,
 * `.env.production.local`, puis l'environnement du shell (prioritaire). Indispensable sous Windows, où l'on crée un fichier
 * `.env.production` plutôt que d'exporter des variables.
 */
export function loadBuildEnv(root = '.', mode = 'production') {
  return loadEnv(mode, root, 'VITE_');
}

/** Valide l'environnement d'un build mobile. Retourne la liste des problèmes (jamais de valeurs). */
export function checkEnv(env) {
  const problems = [];
  const supabase = httpsUrl(env.VITE_SUPABASE_URL ?? '');
  if (!supabase) problems.push('VITE_SUPABASE_URL doit être une URL https valide.');
  else if (LOCAL_HOST.test(supabase.hostname)) problems.push('VITE_SUPABASE_URL pointe vers une adresse locale/de test : interdit pour un build mobile.');
  const anon = env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!anon) problems.push('VITE_SUPABASE_ANON_KEY est manquante.');
  else if (jwtRole(anon) === 'service_role') problems.push('VITE_SUPABASE_ANON_KEY contient une clé service_role : elle ne doit JAMAIS être dans une application.');
  const web = httpsUrl(env.VITE_PUBLIC_WEB_URL ?? '');
  if (!web) problems.push('VITE_PUBLIC_WEB_URL doit être l\'URL publique https du site (liens des e-mails d\'authentification).');
  else if (LOCAL_HOST.test(web.hostname)) problems.push('VITE_PUBLIC_WEB_URL pointe vers une adresse locale/de test : interdit pour un build mobile.');
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_') && SECRET_NAME.test(name) && name !== 'VITE_SUPABASE_ANON_KEY') problems.push(`La variable ${name} a un nom de secret : tout VITE_* est public dans l'application.`);
  }
  return problems;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(js|mjs|css|html|json|map|txt|webmanifest)$/i.test(entry)) yield p;
  }
}

const BUNDLE_FORBIDDEN = [
  [/SUPABASE_SERVICE_ROLE_KEY/, 'référence à SUPABASE_SERVICE_ROLE_KEY'],
  [/CINETPAY_(API_KEY|SECRET_KEY|SITE_ID)/, 'référence à un secret CinetPay'],
  [/sk_live_[A-Za-z0-9]{10,}/, 'clé secrète de type sk_live'],
];

/** Analyse le build web embarqué. Retourne les problèmes ; jamais le contenu trouvé. */
export function scanBundle(dir) {
  const problems = [];
  if (!existsSync(dir)) return [`Le dossier ${dir} n'existe pas : lancez d'abord le build.`];
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8');
    for (const [re, label] of BUNDLE_FORBIDDEN) if (re.test(text)) problems.push(`${file} : ${label}.`);
    for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g)) {
      if (jwtRole(m[0]) === 'service_role') problems.push(`${file} : jeton JWT de rôle service_role.`);
    }
  }
  return problems;
}

/** Vérifie la configuration Capacitor copiée dans les projets natifs (générée par `cap sync`). */
export function checkNativeConfig(root = '.') {
  const problems = [];
  const files = [join(root, 'android/app/src/main/assets/capacitor.config.json'), join(root, 'ios/App/App/capacitor.config.json')];
  let found = 0;
  for (const f of files) {
    if (!existsSync(f)) continue;
    found++;
    let cfg;
    try { cfg = JSON.parse(readFileSync(f, 'utf8')); } catch { problems.push(`${f} : JSON illisible.`); continue; }
    const server = cfg.server ?? {};
    if (server.url) problems.push(`${f} : server.url est défini (URL de développement embarquée).`);
    if (server.cleartext === true) problems.push(`${f} : server.cleartext est activé.`);
    if (server.allowNavigation?.length) problems.push(`${f} : server.allowNavigation est défini (navigation externe dans la WebView).`);
    if (cfg.android?.allowMixedContent === true) problems.push(`${f} : contenu mixte autorisé.`);
  }
  if (found === 0) problems.push('Aucune configuration native trouvée : lancez `npx cap sync`.');
  return problems;
}

/** Fichiers générés par `cap sync` dans le dossier web natif, absents de dist/ : ignorés dans la comparaison. */
const GENERATED_BY_SYNC = new Set(['cordova.js', 'cordova_plugins.js']);

function* walkFiles(dir, base = dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walkFiles(p, base);
    else yield relative(base, p).split('\\').join('/');
  }
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/** Le dossier web d'un projet natif est-il identique au build `dist/` actuel ? Retourne les problèmes (jamais le contenu). */
export function compareWebAssets(distDir, nativePublicDir) {
  if (!existsSync(distDir)) return [`${distDir} absent : lancez le build.`];
  if (!existsSync(nativePublicDir)) return [`${nativePublicDir} absent : lancez \`npx cap sync\`.`];
  const dist = new Set(walkFiles(distDir));
  const native = new Set([...walkFiles(nativePublicDir)].filter((f) => !GENERATED_BY_SYNC.has(f)));
  const missing = [...dist].filter((f) => !native.has(f));
  const extra = [...native].filter((f) => !dist.has(f));
  const different = [...dist].filter((f) => native.has(f) && sha(join(distDir, f)) !== sha(join(nativePublicDir, f)));
  const problems = [];
  const sample = (a) => a.slice(0, 3).join(', ') + (a.length > 3 ? '…' : '');
  if (missing.length) problems.push(`${missing.length} fichier(s) du build absent(s) du projet natif (${sample(missing)}).`);
  if (extra.length) problems.push(`${extra.length} fichier(s) obsolète(s) dans le projet natif (${sample(extra)}).`);
  if (different.length) problems.push(`${different.length} fichier(s) différent(s) du build actuel (${sample(different)}).`);
  if (problems.length) problems.push('Le projet natif n\'est pas synchronisé avec le build web actuel : `npm run cap:sync`.');
  return problems;
}

function main() {
  const mode = process.argv[2];
  const nativeProblems = () => [
    ...checkNativeConfig('.'),
    ...(existsSync('dist') && existsSync('android/app/src/main/assets/public') ? compareWebAssets('dist', 'android/app/src/main/assets/public') : []),
    ...(existsSync('dist') && existsSync('ios/App/App/public/index.html') ? compareWebAssets('dist', 'ios/App/App/public') : []),
  ];
  const problems = mode === 'env' ? checkEnv(loadBuildEnv('.')) : mode === 'bundle' ? scanBundle('dist') : mode === 'native' ? nativeProblems() : null;
  if (problems === null) { console.error('Usage : node scripts/mobile-checks.mjs env|bundle|native'); process.exit(2); }
  if (problems.length > 0) {
    console.error(`✖ Contrôles mobile « ${mode} » : ${problems.length} problème(s)`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`✔ Contrôles mobile « ${mode} » : OK`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
