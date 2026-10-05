/**
 * FAQ — réponses fondées UNIQUEMENT sur les fonctionnalités réellement implémentées.
 * Aucune politique commerciale (délais, frais, garanties) n'est inventée : quand l'information
 * n'existe pas dans le produit, la réponse le dit.
 */
export type FaqCategory = 'account' | 'marketplace' | 'orders' | 'payment' | 'delivery' | 'producer' | 'buyer';

export const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  account: 'Compte', marketplace: 'Marketplace', orders: 'Commandes', payment: 'Paiement', delivery: 'Livraison', producer: 'Producteur', buyer: 'Acheteur',
};

export interface FaqItem { id: string; category: FaqCategory; question: string; answer: string; link?: { label: string; to: string } }

export const FAQ_ITEMS: FaqItem[] = [
  { id: 'create-account', category: 'account', question: 'Comment créer un compte ?', answer: 'Rendez-vous sur la page d\'inscription, choisissez votre profil (producteur, coopérative ou acheteur) puis renseignez vos informations.', link: { label: 'Créer un compte', to: '/register' } },
  { id: 'forgot-password', category: 'account', question: 'J\'ai oublié mon mot de passe', answer: 'Utilisez la page « Mot de passe oublié » : vous recevrez un lien de réinitialisation.', link: { label: 'Réinitialiser mon mot de passe', to: '/forgot-password' } },
  { id: 'edit-profile', category: 'account', question: 'Comment modifier mon profil ?', answer: 'Depuis « Mon profil » : photo, nom, téléphone, localisation et présentation. Le rôle et la vérification du compte ne sont pas modifiables par vous.', link: { label: 'Mon profil', to: '/profile' } },
  { id: 'search-products', category: 'marketplace', question: 'Comment rechercher un produit ?', answer: 'Sur la marketplace, utilisez la recherche et les filtres (catégorie, province…) puis ouvrez une offre pour voir le détail et le producteur.', link: { label: 'Ouvrir la marketplace', to: '/marketplace' } },
  { id: 'buyer-request', category: 'buyer', question: 'Que faire si je ne trouve pas ce que je cherche ?', answer: 'Publiez une demande d\'achat : Agri-Match vous propose les offres correspondantes (produit, quantité, lieu, budget). Le score affiché est indicatif.', link: { label: 'Publier une demande', to: '/buyer/requests' } },
  { id: 'place-order', category: 'orders', question: 'Comment passer une commande ?', answer: 'Ajoutez les offres à votre panier, indiquez l\'adresse de livraison, choisissez le mode de paiement puis validez. Le producteur est notifié et doit confirmer la commande.', link: { label: 'Voir mon panier', to: '/cart' } },
  { id: 'track-order', category: 'orders', question: 'Comment suivre une commande ?', answer: 'Depuis « Mes commandes », ouvrez la commande : son statut (en attente, confirmée, en préparation, prête, en livraison, livrée, terminée ou annulée) et son historique y sont affichés.', link: { label: 'Mes commandes', to: '/buyer/orders' } },
  { id: 'cancel-order', category: 'orders', question: 'Puis-je annuler une commande ?', answer: 'L\'acheteur peut annuler une commande tant qu\'elle est en attente de confirmation. Le producteur peut refuser ou annuler avant l\'expédition. Au-delà, contactez AgriFlow.' },
  { id: 'payment-how', category: 'payment', question: 'Comment fonctionne le paiement ?', answer: 'Vous pouvez payer en ligne via CinetPay (Mobile Money ou carte) ou en espèces à la livraison, selon les moyens proposés au moment de la commande.' },
  { id: 'payment-status', category: 'payment', question: 'Mon paiement est « en cours » ou a échoué, que faire ?', answer: 'Un paiement « en cours » se confirme dès réception de la confirmation de l\'opérateur. S\'il a échoué ou expiré, vous pouvez réessayer depuis la page de la commande.' },
  { id: 'payment-producer', category: 'payment', question: 'Quand le producteur est-il payé ?', answer: 'À la confirmation du paiement, la commission de la plateforme et le montant net du producteur sont calculés. Le versement au producteur est aujourd\'hui un processus manuel.' },
  { id: 'delivery-track', category: 'delivery', question: 'Comment est suivie la livraison ?', answer: 'Le statut de livraison (préparation, prête, en livraison, livrée) est mis à jour par le producteur et visible sur la commande. AgriFlow n\'affecte pas automatiquement de transporteur.', link: { label: 'Mes livraisons', to: '/deliveries' } },
  { id: 'become-producer', category: 'producer', question: 'Comment devenir producteur ?', answer: 'Créez un compte en choisissant « Producteur » (ou « Coopérative »), complétez votre profil puis publiez votre première production.', link: { label: 'Commencer à vendre', to: '/register' } },
  { id: 'publish-product', category: 'producer', question: 'Comment publier un produit ?', answer: 'Depuis « Mes produits » > « Ajouter un produit » : nom, quantité, unité, prix, localisation, disponibilité et photos. Seules les offres « Disponible » sont visibles et commandables.', link: { label: 'Ajouter un produit', to: '/producer/products/new' } },
  { id: 'stock', category: 'producer', question: 'Comment gérer mon stock ?', answer: 'Modifiez la quantité de l\'offre. Le stock est décompté à chaque commande et remis en vente si la commande est annulée. Vous pouvez aussi mettre une offre en pause.' },
  { id: 'contact', category: 'account', question: 'Comment contacter AgriFlow ?', answer: 'Consultez la page Contact : elle affiche les canaux officiels disponibles.', link: { label: 'Page Contact', to: '/contact' } },
];
