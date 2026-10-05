# Sauvegarde et restauration

**Restauration réelle : NON TESTÉE.** Elle ne peut pas être exécutée depuis ce dépôt (elle exige un projet Supabase et ses sauvegardes).
Ne jamais « tester » une restauration en écrasant la production : toujours vers un projet distinct.

## 1. Backup
- **Sauvegardes gérées par Supabase** : quotidiennes sur les offres payantes ; *Point-in-Time Recovery* en option payante ; **aucune sauvegarde automatique sur l'offre gratuite**. Vérifier l'offre : Dashboard → Database → Backups.
- **Export logique indépendant** (à planifier, ex. hebdomadaire, stocké hors Supabase et chiffré) :
```bash
supabase link --project-ref <REF>
supabase db dump --linked -f backup/schema.sql                 # schéma
supabase db dump --linked --data-only -f backup/data.sql       # données (contient des données personnelles : chiffrer, restreindre l'accès)
supabase db dump --linked --role-only -f backup/roles.sql      # rôles
```
- **Fichiers Storage** (`avatars`, `product-images`) : NON inclus dans un dump SQL — à copier séparément (Dashboard / API Storage).
- **Secrets** : jamais dans un backup ; conservés dans le gestionnaire de secrets de l'équipe (CinetPay, Resend, `CRON_SECRET`).

## 2. Restore (vers un projet NEUF ou de test)
```bash
supabase link --project-ref <REF_PROJET_DE_TEST>
psql "$DATABASE_URL_TEST" -f backup/roles.sql
psql "$DATABASE_URL_TEST" -f backup/schema.sql
psql "$DATABASE_URL_TEST" -f backup/data.sql
supabase secrets set --env-file supabase/functions/.env        # secrets du projet de test
supabase functions deploy <chaque fonction>
```
Alternative : restaurer une sauvegarde gérée depuis le dashboard (PITR / backup) — l'opération remplace la base du projet ciblé : choisir un projet de test.

## 3. Vérification après restauration
```sql
select count(*) from profiles; select count(*) from orders; select count(*) from products;       -- ordres de grandeur attendus
select tablename from pg_tables where schemaname='public' and not rowsecurity;                  -- 0 ligne : RLS active partout
select status, count(*) from orders group by 1; select status, count(*) from payments group by 1; -- cohérence
select count(*) from orders o join payments p on p.order_id=o.id where p.status='paid' and o.payment_status<>'paid'; -- doit être 0
```
puis : connexion d'un compte de test, lecture d'une commande, vérification de la planification du cron (`docs/CRON.md`) et des images (Storage).

## 4. Recovery (incident en production)
1. Geler les écritures si nécessaire (page de maintenance Render, désactiver les moyens de paiement dans `payment_settings`).
2. Identifier l'heure du dernier état sain ; restaurer **dans un projet de récupération** (PITR ou dump).
3. Comparer (section 3), puis basculer : soit migrer le trafic vers le projet récupéré (nouvelles `VITE_SUPABASE_*`, secrets, webhook CinetPay, Auth URL), soit recopier sélectivement les lignes perdues.
4. **Réconcilier les paiements** avec CinetPay (une commande `paid` sans remboursement à traiter alors qu'elle est annulée = anomalie) avant de rouvrir les paiements.
5. Consigner l'incident ; planifier un exercice de restauration réel (non encore fait).
