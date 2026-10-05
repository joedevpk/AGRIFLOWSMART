import { Link } from 'react-router-dom';
import { Undo2 } from 'lucide-react';
import { LegalLayout, type LegalSectionDef } from '@/components/legal/LegalLayout';
import { Callout, CardTable, Configure, Todo } from '@/components/legal/blocks';
import { ContactBlock } from '@/components/legal/ContactBlock';

const TBD = <strong className="text-amber-800 dark:text-accent-300">À CONFIGURER</strong>;

const sections: LegalSectionDef[] = [
  {
    id: 'principes', title: 'Principes',
    content: (<>
      <p>Cette page explique ce qui se passe lorsqu'une commande est annulée ou qu'un problème survient, <strong>selon le fonctionnement réel d'AgriFlow aujourd'hui</strong>. Aucun délai ni aucune garantie commerciale n'est promis tant que l'exploitant ne les a pas définis (section 6).</p>
      <Callout title="À retenir" tone="good">Le remboursement d'un paiement en ligne déjà encaissé est aujourd'hui un <strong>traitement manuel</strong> suivi par l'administration d'AgriFlow. Il n'est pas automatique.</Callout>
    </>),
  },
  {
    id: 'annulation', title: 'Conditions d\'annulation',
    content: (<ul>
      <li>L'<strong>acheteur</strong> peut annuler sa commande tant qu'elle est <strong>en attente de confirmation</strong> par le producteur.</li>
      <li>Le <strong>producteur</strong> peut refuser une commande en attente, ou l'annuler tant qu'elle n'est pas prête.</li>
      <li>Une fois la commande prête, en livraison ou livrée, l'annulation passe par l'administration : <Link to="/contact">contactez AgriFlow</Link>.</li>
      <li>À l'annulation, le stock réservé est remis en vente.</li>
    </ul>),
  },
  {
    id: 'cas', title: 'Conditions de remboursement selon les cas',
    content: (<>
      <CardTable caption="Cas de remboursement" columns={['Situation', 'Ce qui se passe aujourd\'hui']} rows={[
        ['Commande annulée avant tout paiement', 'Aucun montant n\'a été encaissé : il n\'y a rien à rembourser.'],
        ['Paiement à la livraison, commande annulée', 'Aucun paiement en ligne n\'a eu lieu. Le règlement se fait à la livraison ; s\'il a déjà été remis, contactez AgriFlow.'],
        ['Commande annulée après un paiement en ligne réussi', 'L\'annulation ne modifie jamais le paiement à elle seule. Le remboursement doit être demandé et traité séparément, manuellement.'],
        ['Paiement échoué ou expiré', 'Vous pouvez réessayer depuis la commande. Si vous avez été débité malgré un échec affiché, contactez AgriFlow avec la référence de la commande.'],
        ['Paiement « en cours » qui n\'aboutit pas', 'Le statut se met à jour dès confirmation du prestataire. Sans changement, contactez AgriFlow.'],
        ['Problème de livraison', 'Le statut est mis à jour par le producteur. AgriFlow n\'affecte pas de transporteur : en cas de retard ou de non-livraison, contactez AgriFlow.'],
        ['Produit non conforme', 'Aucun parcours dédié n\'existe dans l\'application. La réclamation se fait par contact (section 4).'],
      ]} />
      <Todo><p>Conditions précises d'éligibilité à un remboursement (produit non conforme, non-livraison, remboursement partiel ou total) : à définir par l'exploitant et à valider juridiquement.</p></Todo>
    </>),
  },
  {
    id: 'reclamation', title: 'Procédure de réclamation',
    content: (<>
      <ol>
        <li>Rassemblez le numéro de la commande, la date, et si possible une capture du statut ou du paiement.</li>
        <li>Décrivez le problème par le canal officiel ci-dessous.</li>
        <li>L'équipe examine la demande et, si un remboursement est accordé, l'enregistre dans le suivi des remboursements.</li>
      </ol>
      <ContactBlock topic="canal officiel de réclamation et de demande de remboursement" />
      <Todo><p>L'application ne propose pas encore de bouton « demander un remboursement » (la fonction serveur existe, l'écran n'a pas été créé). Les réclamations passent donc par contact.</p></Todo>
    </>),
  },
  {
    id: 'traitement', title: 'Méthode de traitement',
    content: (<>
      <p>Un remboursement suit un cycle suivi par l'administration : <strong>demandé → en cours de traitement → terminé ou échoué</strong>. Il est effectué manuellement (virement ou dépôt), car aucun remboursement automatique n'est branché chez le prestataire de paiement à ce jour.</p>
      <Configure><p>Moyen de remboursement (même moyen que le paiement d'origine ou autre), et devise remboursée : à définir. Aucune conversion de devise n'est effectuée par AgriFlow.</p></Configure>
    </>),
  },
  {
    id: 'parametres', title: 'Valeurs à définir avant production',
    content: (<>
      <p>Ces paramètres n'ont pas encore été décidés. Ils seront publiés ici, et non remplacés par des valeurs arbitraires.</p>
      <CardTable caption="Paramètres commerciaux à configurer" columns={['Paramètre', 'Valeur']} rows={[
        ['Délai pour déposer une réclamation', TBD],
        ['Délai de traitement d\'un remboursement', TBD],
        ['Frais éventuellement retenus', TBD],
        ['Remboursement partiel possible', TBD],
        ['Garantie commerciale sur les produits', TBD],
        ['Responsabilité en cas de produit non conforme (producteur / AgriFlow)', TBD],
      ]} />
      <p>Voir aussi les <Link to="/conditions#annulation">conditions d'utilisation</Link> et la <Link to="/confidentialite#commandes-paiements">gestion des données de paiement</Link>.</p>
    </>),
  },
];

export function RefundPage() {
  return (
    <LegalLayout
      path="/remboursement"
      icon={Undo2}
      title="Politique de remboursement"
      intro="Annulation, remboursement, problème de livraison ou de conformité : ce qui est prévu aujourd'hui et ce qui reste à définir."
      seo={{ title: 'Politique de remboursement | AgriFlow RDC', description: 'Conditions d\'annulation et de remboursement sur AgriFlow RDC : cas de figure, procédure de réclamation et méthode de traitement.' }}
      sections={sections}
    />
  );
}
