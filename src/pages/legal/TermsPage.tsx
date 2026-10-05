import { Link } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { LegalLayout, type LegalSectionDef } from '@/components/legal/LegalLayout';
import { Callout, Configure, Todo } from '@/components/legal/blocks';
import { ContactBlock } from '@/components/legal/ContactBlock';
import { LEGAL_UPDATED_LABEL } from '@/lib/legal/meta';

const sections: LegalSectionDef[] = [
  {
    id: 'objet', title: 'Objet de la plateforme',
    content: (<>
      <p>AgriFlow RDC est une plateforme numérique qui met en relation des producteurs agricoles, des coopératives et des acheteurs en République démocratique du Congo. Elle permet de publier des offres, d'en rechercher, de passer et suivre des commandes, de payer en ligne ou à la livraison, et d'accéder à des outils agricoles (AgriGuide, Ma Parcelle, Agri-Match).</p>
      <p>En créant un compte ou en utilisant la plateforme, vous acceptez les présentes conditions.</p>
      <Todo>
        <p>Identité de l'éditeur (dénomination, adresse, numéro d'enregistrement) : non définie dans le projet, à renseigner par l'exploitant.</p>
        <p>Qualification juridique du rôle d'AgriFlow (simple intermédiaire de mise en relation ou partie à la vente, puisque les paiements en ligne transitent par le compte marchand d'AgriFlow) : à faire valider par un professionnel du droit.</p>
      </Todo>
    </>),
  },
  {
    id: 'definitions', title: 'Définitions',
    content: (<ul>
      <li><strong>Plateforme</strong> : le site et l'application AgriFlow RDC.</li>
      <li><strong>Utilisateur</strong> : toute personne disposant d'un compte.</li>
      <li><strong>Producteur</strong> : utilisateur qui vend sa production. Les <strong>coopératives</strong> vendent la production de leurs membres et suivent les mêmes règles.</li>
      <li><strong>Acheteur</strong> : utilisateur qui recherche et commande des produits (restaurant, marché, grossiste, agro-industrie, entreprise…).</li>
      <li><strong>Offre</strong> : produit publié par un producteur, avec quantité, unité, prix, devise et localisation.</li>
      <li><strong>Commande</strong> : demande d'achat d'une ou plusieurs offres, suivie par statuts.</li>
    </ul>),
  },
  {
    id: 'compte', title: 'Création de compte',
    content: (<>
      <p>Un compte est nécessaire pour commander, publier ou utiliser la messagerie. Vous choisissez votre profil (producteur, coopérative ou acheteur) à l'inscription et vous fournissez au minimum votre nom, une adresse e-mail et un mot de passe.</p>
      <p>Vous êtes responsable de l'exactitude de vos informations et de la confidentialité de votre mot de passe. Les comptes administrateur ne peuvent pas être créés par l'inscription publique. Le statut « vérifié » est attribué par l'administration.</p>
      <Todo><p>Âge minimum et conditions de capacité pour créer un compte : non définis, à décider et valider.</p></Todo>
    </>),
  },
  {
    id: 'producteur', title: 'Utilisateur producteur',
    content: (<>
      <p>Le producteur publie ses offres, gère son stock, confirme, prépare et livre les commandes reçues, et met à jour leur statut. Il s'engage à honorer les commandes qu'il confirme.</p>
      <p>Il peut refuser une commande en attente, et l'annuler tant qu'elle n'est pas prête. Une commission de la plateforme et un montant net sont calculés pour chaque commande ; le versement au producteur est aujourd'hui un processus manuel, non automatique.</p>
      <Configure><p>Taux et modalités de la commission d'AgriFlow, calendrier et mode de versement au producteur : à définir et à communiquer avant production. La valeur par défaut présente dans la configuration technique est provisoire.</p></Configure>
    </>),
  },
  {
    id: 'acheteur', title: 'Utilisateur acheteur',
    content: (<>
      <p>L'acheteur recherche des offres, publie éventuellement une demande d'achat, ajoute des offres à son panier, indique une adresse de livraison, choisit un mode de paiement et valide. Un panier ne peut regrouper que des offres dans la même devise.</p>
      <p>Il suit sa commande depuis « Mes commandes » et confirme la réception à la livraison. Ses demandes d'achat sont consultables publiquement.</p>
    </>),
  },
  {
    id: 'publication', title: 'Publication des produits',
    content: (<>
      <p>Chaque offre indique nom, description, quantité, unité, prix, devise, localisation, disponibilité et, si possible, des photos. Seules les offres « Disponible » sont visibles et commandables. Les prix restent dans la devise choisie par le producteur ; AgriFlow n'effectue aucune conversion.</p>
      <p>Vous ne pouvez publier que des produits dont vous pouvez disposer, avec des photos dont vous avez le droit de vous servir.</p>
    </>),
  },
  {
    id: 'exactitude', title: 'Exactitude des informations',
    content: (<>
      <p>Chacun est responsable de l'exactitude des informations qu'il publie (profil, offres, demandes, adresse de livraison). Le score d'Agri-Match et les recommandations agricoles sont <strong>indicatifs</strong> : ils ne remplacent ni l'avis d'un agronome ni votre propre vérification.</p>
    </>),
  },
  {
    id: 'commandes', title: 'Commandes',
    content: (<>
      <p>Une commande est créée à la validation du panier. Le producteur est notifié et doit la confirmer. Elle progresse ensuite par statuts : en attente, confirmée, en préparation, prête, en livraison, livrée, terminée — ou annulée. Le stock est décompté à la commande et remis en vente si elle est annulée.</p>
      <p>Le prix est recalculé et vérifié côté serveur au moment de la commande.</p>
    </>),
  },
  {
    id: 'paiements', title: 'Paiements',
    content: (<>
      <p>Selon les moyens proposés au moment de la commande, vous pouvez payer en ligne via <strong>CinetPay</strong> (Mobile Money ou carte) ou <strong>en espèces à la livraison</strong>. Le paiement en ligne se fait sur la page hébergée par CinetPay : AgriFlow ne voit ni ne stocke vos données bancaires.</p>
      <p>Un paiement n'est considéré comme réussi qu'après confirmation du prestataire, vérifiée par le serveur. Un paiement « en cours » n'est pas un échec ; s'il échoue ou expire, vous pouvez réessayer depuis la commande. Voir la <Link to="/confidentialite#commandes-paiements">politique de confidentialité</Link> pour le détail des données.</p>
      <Configure><p>Moyens de paiement et devises effectivement ouverts au public : dépendent de la validation du compte marchand auprès de CinetPay.</p></Configure>
    </>),
  },
  {
    id: 'livraison', title: 'Livraison',
    content: (<>
      <p>Le statut de livraison (préparation, prête, en livraison, livrée) est mis à jour par le producteur et visible sur la commande. AgriFlow n'affecte pas de transporteur automatiquement. Les frais éventuels sont ceux affichés dans le récapitulatif de la commande.</p>
    </>),
  },
  {
    id: 'annulation', title: 'Annulation',
    content: (<>
      <ul>
        <li>L'<strong>acheteur</strong> peut annuler une commande tant qu'elle est <strong>en attente de confirmation</strong>.</li>
        <li>Le <strong>producteur</strong> peut refuser une commande en attente, ou l'annuler tant qu'elle n'est pas prête.</li>
        <li>Au-delà, seule l'administration peut annuler : <Link to="/contact">contactez AgriFlow</Link>.</li>
      </ul>
      <p>Une annulation ne modifie jamais automatiquement un paiement déjà encaissé : voir la <Link to="/remboursement">politique de remboursement</Link>.</p>
    </>),
  },
  {
    id: 'remboursement', title: 'Remboursement',
    content: (<>
      <p>Le remboursement d'un paiement encaissé est aujourd'hui un <strong>processus manuel</strong> suivi par l'administration. Les cas, la procédure et les valeurs à définir sont détaillés dans la <Link to="/remboursement">politique de remboursement</Link>, qui fait partie des présentes conditions.</p>
    </>),
  },
  {
    id: 'responsabilites', title: 'Responsabilités',
    content: (<>
      <p>AgriFlow s'efforce d'assurer un service fiable mais ne garantit pas une disponibilité continue ni l'absence d'erreur. Chaque utilisateur est responsable de ses contenus, de ses offres, de la qualité des produits qu'il vend et du respect de ses engagements de livraison et de paiement.</p>
      <Todo><p>Limitation de responsabilité, garanties légales, qualité et conformité des produits, litiges entre utilisateurs, droit applicable et juridiction compétente : à rédiger et valider par un professionnel du droit. Aucune clause n'est inventée ici.</p></Todo>
    </>),
  },
  {
    id: 'interdit', title: 'Utilisation interdite',
    content: (<>
      <p>Il est interdit notamment de :</p>
      <ul>
        <li>fournir de fausses informations ou usurper l'identité d'autrui ;</li>
        <li>publier des offres fictives, trompeuses ou illicites ;</li>
        <li>tenter d'accéder aux données d'autres utilisateurs ou de contourner les protections de la plateforme (droits d'accès, paiement, statuts) ;</li>
        <li>perturber le fonctionnement du service ou l'utiliser à des fins frauduleuses ;</li>
        <li>utiliser la messagerie pour du harcèlement ou du démarchage abusif.</li>
      </ul>
    </>),
  },
  {
    id: 'suspension', title: 'Suspension de compte',
    content: (<>
      <p>L'administration peut intervenir sur des contenus ou des comptes en cas d'usage contraire aux présentes conditions.</p>
      <Todo><p>Aucune fonction de suspension automatisée n'existe dans l'application. Motifs, préavis, possibilité de recours et effets sur les commandes en cours : à définir avant production.</p></Todo>
    </>),
  },
  {
    id: 'propriete', title: 'Propriété intellectuelle',
    content: (<>
      <p>La marque, l'interface, les textes et les guides d'AgriFlow appartiennent à leur éditeur. Vous conservez vos droits sur vos contenus (textes, photos) ; en les publiant, vous autorisez AgriFlow à les afficher sur la plateforme pour les besoins du service. Certaines images d'illustration proviennent de sources tierces créditées dans le projet (<code>CREDITS-IMAGES.md</code>).</p>
      <Todo><p>Titulaire exact des droits et licences applicables : à confirmer avec l'éditeur.</p></Todo>
    </>),
  },
  {
    id: 'donnees', title: 'Données personnelles',
    content: (<p>Le traitement de vos données est décrit dans la <Link to="/confidentialite">politique de confidentialité</Link> et la <Link to="/cookies">politique de cookies</Link>. Vous pouvez gérer vos données depuis <Link to="/profile#confidentialite">Mon profil</Link>.</p>),
  },
  {
    id: 'modification', title: 'Modification des conditions',
    content: (<>
      <p>Ces conditions peuvent évoluer avec la plateforme. Leur date de dernière mise à jour est <strong>{LEGAL_UPDATED_LABEL}</strong>.</p>
      <Todo><p>Mode d'information et d'acceptation des nouvelles conditions : à définir.</p></Todo>
      <Callout title="Statut du document" tone="info">Ce texte décrit le fonctionnement réel actuel d'AgriFlow. Il n'a pas encore été validé juridiquement.</Callout>
    </>),
  },
  {
    id: 'contact', title: 'Contact',
    content: (<>
      <p>Une question sur ces conditions ?</p>
      <ContactBlock topic="canal de contact officiel pour les questions juridiques et les réclamations" />
      <p>Voir aussi le <Link to="/help">centre d'aide</Link>.</p>
    </>),
  },
];

export function TermsPage() {
  return (
    <LegalLayout
      path="/conditions"
      icon={ScrollText}
      title="Conditions d'utilisation"
      intro="Les règles d'usage d'AgriFlow pour les producteurs, coopératives et acheteurs, telles qu'elles fonctionnent aujourd'hui."
      seo={{ title: 'Conditions d\'utilisation | AgriFlow RDC', description: 'Conditions d\'utilisation d\'AgriFlow RDC : compte, publication, commandes, paiements, livraison, annulation, responsabilités et suspension.' }}
      sections={sections}
    />
  );
}
