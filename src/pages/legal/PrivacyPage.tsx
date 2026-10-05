import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { LegalLayout, type LegalSectionDef } from '@/components/legal/LegalLayout';
import { Callout, CardTable, Todo } from '@/components/legal/blocks';
import { ContactBlock } from '@/components/legal/ContactBlock';
import { openConsentPreferences } from '@/lib/consent';
import { LEGAL_UPDATED_LABEL } from '@/lib/legal/meta';

const sections: LegalSectionDef[] = [
  {
    id: 'introduction', title: 'Introduction',
    content: (<>
      <p>AgriFlow RDC est une plateforme de mise en relation entre producteurs agricoles, coopératives et acheteurs en République démocratique du Congo. Cette politique explique quelles données personnelles l'application traite, pourquoi, qui peut les voir et quels choix vous avez.</p>
      <p>Elle décrit uniquement les traitements <strong>réellement présents dans l'application à la date de mise à jour</strong>. Elle sera modifiée si l'application évolue.</p>
      <Todo>
        <p><strong>Responsable du traitement :</strong> l'identité juridique de l'éditeur d'AgriFlow (dénomination, forme, adresse, numéro d'enregistrement) n'est pas définie dans le projet. À renseigner par l'exploitant — rien n'a été inventé ici.</p>
        <p><strong>Cadre légal :</strong> la législation congolaise applicable à la protection des données personnelles doit être identifiée et confirmée par un professionnel du droit. Ce document n'affirme la conformité à aucune loi ni certification.</p>
      </Todo>
    </>),
  },
  {
    id: 'donnees-collectees', title: 'Données collectées',
    content: (<>
      <p>Nous ne collectons que ce dont les fonctions de la plateforme ont besoin (principe de minimisation).</p>
      <CardTable caption="Données traitées par AgriFlow" columns={['Catégorie', 'Données', 'Quand']} rows={[
        ['Compte', 'Nom complet, adresse e-mail, mot de passe (traité par le service d\'authentification), rôle choisi (producteur, coopérative, acheteur), type d\'acheteur.', 'Obligatoire pour créer un compte.'],
        ['Profil', 'Téléphone, province, ville, présentation, photo.', 'Facultatif.'],
        ['Activité de vente', 'Produits publiés : nom, description, quantité, unité, prix, devise, localisation, disponibilité, photos.', 'Si vous publiez une offre.'],
        ['Activité d\'achat', 'Demandes d\'achat (produit, quantité, budget, lieu, date souhaitée, description), favoris, panier.', 'Si vous utilisez ces fonctions.'],
        ['Commandes et livraison', 'Articles, montants, devise, mode de paiement choisi, adresse et ville de livraison, notes, statuts et historique.', 'Nécessaire pour passer ou traiter une commande.'],
        ['Paiement', 'Référence de transaction, statut, montant, devise, moyen choisi, opérateur et numéro Mobile Money lorsqu\'ils sont fournis pour le paiement. Aucune donnée bancaire (voir section 6).', 'Si vous payez en ligne.'],
        ['Échanges', 'Messages, notifications, avis.', 'Si vous les utilisez.'],
        ['Ma Parcelle et AgriGuide', 'Parcelles (nom, zone, localité, coordonnées facultatives, surface, cultures, notes) et progression dans les guides.', 'Facultatif.'],
        ['Données techniques', 'Jeton de session, choix de cookies, préférences d\'affichage, données mises en cache sur votre appareil.', 'Fonctionnement du service (voir sections 9 et 10).'],
      ]} />
      <p>L'application ne demande ni numéro de carte bancaire, ni code PIN, ni pièce d'identité.</p>
      <Todo><p>Journaux techniques (adresse IP, journaux de connexion) : ils peuvent être tenus par les prestataires d'hébergement et de base de données. Leur contenu et leur durée doivent être documentés après vérification de la configuration réelle de ces services.</p></Todo>
    </>),
  },
  {
    id: 'finalites', title: 'Pourquoi nous collectons ces données',
    content: (<>
      <ul>
        <li><strong>Créer et sécuriser votre compte</strong> et vous identifier.</li>
        <li><strong>Vous mettre en relation</strong> : profils, offres et demandes d'achat visibles des autres utilisateurs.</li>
        <li><strong>Traiter les commandes et les livraisons</strong> : confirmation, préparation, suivi, historique.</li>
        <li><strong>Permettre le paiement</strong> en ligne ou à la livraison, et suivre son statut.</li>
        <li><strong>Faire fonctionner la messagerie et les notifications</strong> liées à vos commandes.</li>
        <li><strong>Vous proposer des correspondances (Agri-Match)</strong> et des outils agricoles (AgriGuide, Ma Parcelle).</li>
        <li><strong>Protéger la plateforme</strong> : droits d'accès, prévention des abus.</li>
        <li><strong>Mémoriser vos préférences d'affichage</strong>, uniquement si vous l'autorisez.</li>
      </ul>
      <Todo><p>Base juridique de chaque finalité (exécution du contrat, consentement, intérêt légitime, obligation légale…) : à déterminer selon la loi applicable. Non affirmée ici.</p></Todo>
    </>),
  },
  {
    id: 'utilisation', title: 'Utilisation des données',
    content: (<>
      <p>Vos données servent aux finalités ci-dessus. Voici qui peut voir quoi :</p>
      <h3>Visible publiquement (même sans compte)</h3>
      <ul>
        <li>Votre nom, province, ville, présentation, photo, rôle et statut « vérifié » (annuaire des producteurs, offres).</li>
        <li>Vos offres publiées et leur localisation.</li>
        <li>Vos <strong>demandes d'achat</strong> : produit, quantité, budget, lieu, description.</li>
        <li>Les avis publiés.</li>
      </ul>
      <h3>Visible de votre partenaire de commande</h3>
      <ul><li>Le contenu de la commande, l'adresse et la ville de livraison, les notes, l'état du paiement, et — une fois une commande passée entre vous — votre numéro de téléphone.</li></ul>
      <h3>Visible de vous seul (règles d'accès de la base)</h3>
      <ul><li>Vos parcelles, notes de parcelle, progression, favoris et notifications.</li></ul>
      <p>L'administration de la plateforme dispose de droits d'accès étendus pour la gestion du service.</p>
      <Callout title="Aucune publicité, aucune revente">L'application ne contient aujourd'hui ni outil publicitaire, ni mécanisme de revente de données.</Callout>
    </>),
  },
  {
    id: 'authentification', title: 'Authentification et compte',
    content: (<>
      <p>La connexion repose sur le service d'authentification de Supabase (adresse e-mail et mot de passe). Une fois connecté, un jeton de session est conservé dans votre navigateur pour vous éviter de vous reconnecter à chaque page ; il est effacé à la déconnexion.</p>
      <p>Le rôle de votre compte est choisi à l'inscription. L'inscription publique ne permet pas de créer un compte administrateur. Vous pouvez modifier vos informations depuis <Link to="/profile">Mon profil</Link>.</p>
    </>),
  },
  {
    id: 'commandes-paiements', title: 'Commandes et paiements',
    content: (<>
      <p>Nous distinguons deux catégories de données.</p>
      <h3>Données de commande — conservées par AgriFlow</h3>
      <p>Articles, quantités, montants, devise, adresse de livraison, notes, statuts, historique et livraison. Elles sont visibles de l'acheteur, du producteur concerné et de l'administration.</p>
      <h3>Données de paiement — traitées par un prestataire externe</h3>
      <ul>
        <li><strong>Paiement en ligne (Mobile Money, carte)</strong> : vous êtes redirigé vers la page de paiement hébergée par <strong>CinetPay</strong>. C'est sur cette page, hors d'AgriFlow, que vous validez le paiement. Les moyens réellement proposés dépendent de la configuration du service au moment de la commande.</li>
        <li><strong>Ce qu'AgriFlow enregistre :</strong> une référence de transaction, le statut du paiement, le montant, la devise, le moyen choisi, les dates associées, ainsi que l'opérateur et le numéro Mobile Money lorsqu'ils sont fournis pour effectuer le paiement.</li>
        <li><strong>Ce qu'AgriFlow n'enregistre pas :</strong> numéro de carte, code PIN, code de sécurité. Aucune donnée de ce type n'est stockée dans la base d'AgriFlow.</li>
        <li><strong>Paiement à la livraison :</strong> aucune donnée de paiement en ligne n'est échangée ; le producteur confirme l'encaissement.</li>
      </ul>
      <p>Les clés secrètes du prestataire de paiement restent côté serveur et ne sont jamais présentes dans l'application affichée dans votre navigateur. Le montant à payer est relu côté serveur, jamais fixé par le navigateur.</p>
      <p>Le traitement des données par CinetPay est soumis à ses propres conditions ; consultez-les sur son site.</p>
      <Todo><p>Les enregistrements de paiement d'une commande sont lisibles par l'acheteur et par le producteur concerné (règles d'accès actuelles). Vérifier si le numéro Mobile Money de l'acheteur doit rester visible du producteur, ou être masqué (minimisation des données) ; puis ajuster ce texte.</p></Todo>
    </>),
  },
  {
    id: 'producteurs', title: 'Données liées aux producteurs',
    content: (<>
      <p>Si vous vendez (producteur ou coopérative), les informations de votre profil et de vos offres sont <strong>publiques</strong> puisqu'elles servent à vous faire connaître : nom, localisation, présentation, photo, produits, quantités, prix.</p>
      <p>Vos parcelles, notes de parcelle et progression dans les guides (Ma Parcelle, AgriGuide) sont, elles, réservées à votre compte. Le badge « vérifié » est attribué par l'administration ; vous ne pouvez pas le modifier vous-même.</p>
      <p>Les montants nets et la commission de la plateforme sont calculés par commande. Le versement au producteur est aujourd'hui un processus manuel.</p>
    </>),
  },
  {
    id: 'localisation', title: 'Données de localisation',
    content: (<>
      <ul>
        <li><strong>Localisation déclarée</strong> : province et ville du profil, localisation d'une offre, ville de livraison. Vous les saisissez vous-même.</li>
        <li><strong>Position de l'appareil</strong> : uniquement dans « Ma Parcelle », si vous appuyez sur le bouton de localisation et que votre navigateur vous en donne l'autorisation. La position est demandée une seule fois, jamais en continu, et n'est enregistrée que si vous sauvegardez la parcelle. Vous pouvez aussi saisir la zone à la main.</li>
      </ul>
      <p>Les coordonnées d'une parcelle ne sont visibles que de votre compte.</p>
    </>),
  },
  {
    id: 'cookies', title: 'Cookies',
    content: (<>
      <p>AgriFlow ne pose pas de cookie HTTP ; il utilise le stockage local de votre navigateur. Nous distinguons les éléments <strong>nécessaires</strong> (connexion, panier, brouillons), les <strong>préférences</strong> (thème, langue — soumises à votre accord) et l'<strong>analytique</strong> (aucun outil utilisé aujourd'hui).</p>
      <p>Détails et durées : <Link to="/cookies">politique de cookies</Link>. Vous pouvez changer d'avis à tout moment : <button type="button" onClick={openConsentPreferences} className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-brand-300">gérer mes préférences</button>.</p>
    </>),
  },
  {
    id: 'stockage', title: 'Stockage des données',
    content: (<>
      <ul>
        <li><strong>Base de données, authentification et fichiers</strong> : hébergés chez Supabase. Les photos de profil et de produits sont stockées dans des espaces de fichiers à lecture publique : toute personne disposant de l'adresse d'une image peut l'afficher.</li>
        <li><strong>Sur votre appareil</strong> : session, panier, brouillons, file d'actions hors connexion, préférences. Le mode hors connexion met en cache l'application elle-même, pas vos données de commande.</li>
        <li><strong>Services tiers contactés par votre navigateur</strong> : la police d'écriture est chargée depuis Google Fonts et certaines images d'illustration depuis des sites tiers ; ces services reçoivent techniquement votre adresse IP lors du chargement.</li>
      </ul>
      <Todo><p>Région d'hébergement Supabase, transferts hors de la RDC, et éventuelle auto-hébergement des polices pour supprimer l'appel à Google Fonts : à décider et documenter.</p></Todo>
    </>),
  },
  {
    id: 'securite', title: 'Sécurité',
    content: (<>
      <p>Mesures réellement en place dans l'application :</p>
      <ul>
        <li>Règles d'accès au niveau de la base (RLS) : un utilisateur ne peut lire ou modifier que les données que les règles lui autorisent.</li>
        <li>Statuts de paiement modifiables uniquement par des fonctions serveur contrôlées ; transitions de statut de commande validées côté serveur.</li>
        <li>Paiements confirmés par le serveur après vérification auprès du prestataire ; notifications de paiement authentifiées par signature.</li>
        <li>Clés secrètes conservées côté serveur.</li>
        <li>Le téléphone n'est pas exposé publiquement.</li>
      </ul>
      <p>Aucune mesure ne garantit une sécurité absolue. <strong>AgriFlow ne revendique aucune certification de sécurité.</strong></p>
      <Todo><p>Audit de sécurité indépendant et procédure de gestion des incidents : non réalisés / non définis à ce jour.</p></Todo>
    </>),
  },
  {
    id: 'conservation', title: 'Durée de conservation',
    content: (<>
      <p>Vos données sont conservées tant que votre compte existe. Sur votre appareil, les préférences et le panier restent jusqu'à ce que vous les effaciez ou retiriez votre consentement.</p>
      <p>À la suppression d'un compte, la plupart des données rattachées au compte (profil, offres, messages, commandes dont vous êtes l'acheteur…) sont conçues pour être supprimées avec lui. Comme cela peut aussi affecter vos partenaires de commande, <strong>toute demande de suppression est examinée avant exécution</strong> (section 13).</p>
      <Todo>
        <p>Durées de conservation précises par catégorie : <strong>non définies</strong>.</p>
        <p>Obligations éventuelles de conservation (comptable, fiscale, litiges) pour les commandes et paiements : à confirmer juridiquement avant de fixer les règles de suppression.</p>
      </Todo>
    </>),
  },
  {
    id: 'droits', title: 'Droits des utilisateurs',
    content: (<>
      <p>Depuis <Link to="/profile#confidentialite">Mon profil › Mes données et ma confidentialité</Link>, vous pouvez dès maintenant :</p>
      <ul>
        <li><strong>consulter</strong> les informations de votre profil et <strong>les modifier</strong> ;</li>
        <li><strong>télécharger une copie</strong> de vos données au format JSON ;</li>
        <li><strong>gérer vos préférences</strong> de cookies et retirer votre consentement ;</li>
        <li><strong>demander la suppression</strong> de votre compte (examinée avant exécution).</li>
      </ul>
      <p>Pour toute autre demande (rectification impossible en ligne, opposition, question sur vos données), contactez-nous (section 14).</p>
      <Todo><p>Liste exacte des droits reconnus par la loi applicable, et délai de réponse : à confirmer. Aucun délai n'est annoncé dans ce texte.</p></Todo>
    </>),
  },
  {
    id: 'contact', title: 'Contact',
    content: (<>
      <p>Pour toute question relative à cette politique ou à vos données :</p>
      <ContactBlock topic="adresse e-mail dédiée aux demandes relatives aux données personnelles" />
      <p>Voir aussi le <Link to="/help">centre d'aide</Link> et la page <Link to="/contact">Contact</Link>.</p>
    </>),
  },
  {
    id: 'modifications', title: 'Modifications de la politique',
    content: (<>
      <p>Cette politique peut évoluer avec l'application. La date de dernière mise à jour figure en haut de page : <strong>{LEGAL_UPDATED_LABEL}</strong>.</p>
      <Todo><p>Mode d'information des utilisateurs en cas de changement important (bandeau, e-mail…) : à définir.</p></Todo>
    </>),
  },
];

export function PrivacyPage() {
  return (
    <LegalLayout
      path="/confidentialite"
      icon={ShieldCheck}
      title="Politique de confidentialité"
      intro="Quelles données AgriFlow traite, pourquoi, qui peut les voir, et les choix qui vous appartiennent."
      seo={{ title: 'Politique de confidentialité | AgriFlow RDC', description: 'Découvrez quelles données personnelles AgriFlow RDC traite, pourquoi, qui peut les voir, comment le paiement est géré et quels sont vos droits.' }}
      sections={sections}
    />
  );
}
