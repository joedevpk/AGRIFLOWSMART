#!/usr/bin/env node
/**
 * Inventaire des fonctionnalités généré À PARTIR DU CODE (routes déclarées, gardes d'accès, pages, fonctions serveur, migrations).
 * Usage : node scripts/inventory.mjs > docs/INVENTAIRE-FONCTIONNALITES.md
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const app = readFileSync('src/App.tsx', 'utf8');
const rows = [];
for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{(.+?)\}\s*\/>/g)) {
  const el = m[2];
  const guards = [...el.matchAll(/<(\w+Route|Protected\w*|Seller\w*|Admin\w*|Buyer\w*|Guest\w*)>/g)].map((g) => g[1]);
  const comps = [...el.matchAll(/<([A-Z]\w+)\s*\/>/g)].map((g) => g[1]);
  rows.push({ path: m[1], page: comps.at(-1) ?? '—', access: guards.length ? guards.join(' › ') : 'public' });
}
const groups = [
  ['Public et découverte', (r) => r.access === 'public' && !/^\/(login|register|forgot|reset)/.test(r.path)],
  ['Authentification', (r) => /^\/(login|register|forgot-password|reset-password)/.test(r.path)],
  ['Espace connecté (acheteur / producteur / commun)', (r) => r.access !== 'public' && !/^\/admin/.test(r.path)],
  ['Administration', (r) => /^\/admin/.test(r.path)],
];
const fns = existsSync('supabase/functions') ? readdirSync('supabase/functions').filter((d) => !d.startsWith('_') && !d.startsWith('.') && existsSync(join('supabase/functions', d, 'index.ts'))) : [];
const migs = existsSync('supabase/migrations') ? readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).length : 0;
const services = readdirSync('src/services').filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
let pageCount = 0;
(function walk(d) { for (const e of readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(join(d, e.name)); else if (e.name.endsWith('.tsx')) pageCount++; } })('src/pages');

const out = ['# Inventaire des fonctionnalités (généré depuis le code)', '',
  `Routes déclarées : **${rows.length}** · pages (.tsx) : **${pageCount}** · services : **${services.length}** · fonctions Edge : **${fns.length}** · migrations SQL : **${migs}**`, '',
  'Généré par `node scripts/inventory.mjs`. « Accès » = gardes de route déclarées dans `src/App.tsx` (la sécurité réelle repose aussi sur la RLS Supabase).', ''];
const seen = new Set();
for (const [title, test] of groups) {
  const list = rows.filter((r) => !seen.has(r.path) && test(r));
  list.forEach((r) => seen.add(r.path));
  out.push(`## ${title} (${list.length})`, '', '| Route | Page | Accès |', '|---|---|---|', ...list.map((r) => `| \`${r.path}\` | ${r.page} | ${r.access} |`), '');
}
const rest = rows.filter((r) => !seen.has(r.path));
if (rest.length) out.push(`## Autres (${rest.length})`, '', '| Route | Page | Accès |', '|---|---|---|', ...rest.map((r) => `| \`${r.path}\` | ${r.page} | ${r.access} |`), '');
out.push('## Fonctions serveur (Supabase Edge Functions)', '', ...fns.map((f) => `- \`${f}\``), '', '## Services applicatifs (`src/services`)', '', ...services.map((f) => `- \`${f}\``), '');
console.log(out.join('\n'));
