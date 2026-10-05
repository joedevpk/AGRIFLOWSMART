# Tests de navigateur — Passe 19 (Playwright / Python, Chromium)

Scripts utilisés pour valider le centre de confiance. Ils ne font **pas** partie du build (`npm run …`).

```bash
pip install playwright && playwright install chromium
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=anon npm run build
npx vite preview --port 4173 &          # puis, dans un autre terminal :
python3 tests-e2e-passe19/cookies.py    # consentement (28 vérifications)
python3 tests-e2e-passe19/pages.py      # 7 largeurs, SEO, sommaire, footer, sombre (164)
python3 tests-e2e-passe19/account.py    # « Mes données et ma confidentialité » (55, Supabase SIMULÉ)
python3 tests-e2e-passe19/contrast.py   # contraste WCAG AA, clair + sombre
```

`account.py` intercepte les requêtes vers `example.supabase.co` : il valide l'interface et le fait qu'**aucune
écriture directe** n'est émise, pas les règles RLS réelles (à tester sur votre projet Supabase, voir le rapport).
`contrast.py` / `pages.py` forcent une police proche de la vraie (Liberation Sans) car Google Fonts n'est pas joignable en CI.
