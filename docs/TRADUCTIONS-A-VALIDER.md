# Traductions à faire valider — Passe 23

Les textes ci-dessous sont les clés ajoutées par la passe 23. **Lingála, Kikongo et Tshiluba ne sont pas traduits** : ils s'affichent en français (repli volontaire, signalé « partiel » dans le sélecteur de langue).
Le **kiswahili** ci-dessous est une première traduction à faire relire par un locuteur natif avant la mise en production.

Pour ajouter une langue : copier la clé dans un objet `P23_LN` / `P23_KG` / `P23_LU` de `src/lib/i18n/passe23.ts`, puis l'étaler dans `TRANSLATIONS` (`translations.ts`). Conserver les marqueurs `{date}`, `{n}`, `{time}`, `{when}`, `{qty}`, `{h}`, `{m}`, `{d}` tels quels.

| Clé | Français (référence) | Kiswahili (à relire) |
|---|---|---|
| `confirm.pendingTitle` | Confirmation du producteur en attente | Tunasubiri uthibitisho wa mzalishaji |
| `confirm.pendingBody` | Le producteur doit confirmer la disponibilité de votre commande. | Mzalishaji anapaswa kuthibitisha kwamba agizo lako linapatikana. |
| `confirm.why` | Cette confirmation est nécessaire avant la préparation de votre commande. | Uthibitisho huu unahitajika kabla agizo lako halijaanza kuandaliwa. |
| `confirm.expectedBefore` | Confirmation attendue avant le {date} | Uthibitisho unatarajiwa kabla ya {date} |
| `confirm.expiresWarning` | Si le producteur ne répond pas avant le {date}, la commande expirera automatiquement. | Mzalishaji asipojibu kabla ya {date}, agizo litaisha muda wake kiotomatiki. |
| `confirm.remaining` | Temps restant : {time} | Muda uliobaki: {time} |
| `confirm.overdue` | Échéance dépassée : la commande va être traitée automatiquement. | Muda umekwisha: agizo litashughulikiwa kiotomatiki. |
| `confirm.lastActivity` | Dernière activité du producteur : {when} | Shughuli ya mwisho ya mzalishaji: {when} |
| `confirm.paymentWaitTitle` | Paiement en attente | Malipo yanasubiriwa |
| `confirm.paymentWaitBody` | Le délai de confirmation du producteur démarre dès que votre paiement est confirmé. | Muda wa uthibitisho wa mzalishaji huanza mara malipo yako yatakapothibitishwa. |
| `confirm.producerTitle` | Cette commande attend votre confirmation | Agizo hili linasubiri uthibitisho wako |
| `confirm.producerBody` | Confirmez ou refusez avant le {date}. Passé ce délai, la commande expirera automatiquement. | Thibitisha au kataa kabla ya {date}. Baada ya muda huo, agizo litaisha muda wake kiotomatiki. |
| `confirm.viewOrder` | Voir la commande | Tazama agizo |
| `confirm.confirm` | Confirmer | Thibitisha |
| `confirm.refuse` | Refuser | Kataa |
| `expired.title` | Commande expirée | Agizo limeisha muda |
| `expired.body` | Ce producteur n'a pas confirmé votre commande à temps. | Mzalishaji huyu hakuthibitisha agizo lako kwa wakati. |
| `expired.rejectedTitle` | Commande refusée par le producteur | Agizo limekataliwa na mzalishaji |
| `expired.rejectedBody` | Le producteur n'a pas pu honorer votre commande. | — |
| `expired.noPayment` | Aucun paiement n'est dû pour cette commande. | — |
| `refund.toProcess` | Commande expirée — remboursement à traiter | Agizo limeisha muda — marejesho yanasubiri kushughulikiwa |
| `refund.inProgress` | Commande expirée — remboursement en cours | Agizo limeisha muda — marejesho yanaendelea |
| `refund.done` | Remboursé | Imerejeshwa |
| `refund.failed` | Remboursement en échec — l'équipe AgriFlow doit intervenir | — |
| `refund.noteToProcess` | Votre paiement a bien été reçu. Une demande de remboursement a été enregistrée : elle doit être traitée par l'équipe AgriFlow. Rien n'est encore remboursé. | — |
| `refund.noteInProgress` | Le remboursement est en cours de traitement par l'équipe AgriFlow. | — |
| `refund.noteDone` | Le remboursement a été confirmé. | — |
| `alt.title` | Alternatives disponibles | Njia mbadala zinazopatikana |
| `alt.found` | Nous avons trouvé des alternatives disponibles. | Tumepata njia mbadala zinazopatikana. |
| `alt.none` | Aucun producteur disponible pour cette demande actuellement. | Hakuna mzalishaji anayepatikana kwa ombi hili kwa sasa. |
| `alt.view` | Voir les alternatives | Tazama njia mbadala |
| `alt.viewOffer` | Voir l'offre | Tazama ofa |
| `alt.fullQty` | Quantité suffisante | — |
| `alt.partialQty` | Quantité disponible : {qty} | — |
| `alt.sameProduct` | Même produit | — |
| `alt.similar` | Produit similaire | — |
| `alt.loading` | Recherche d'alternatives… | — |
| `alt.error` | Impossible de charger les alternatives pour le moment. | — |
| `alt.noAuto` | C'est vous qui choisissez : nous ne sélectionnons jamais un autre producteur à votre place. | Wewe ndiye unayechagua: hatuchagui mzalishaji mwingine kwa niaba yako. |
| `producer.available` | Disponible | Anapatikana |
| `producer.unavailable` | Temporairement indisponible | Hapatikani kwa muda |
| `producer.unavailableNote` | Producteur temporairement indisponible | Mzalishaji hapatikani kwa muda |
| `producer.unavailableUntil` | Indisponible jusqu'au {date} | — |
| `producer.noImmediate` | Ce producteur ne reçoit pas de nouvelles commandes pour le moment : il n'est pas possible de commander ses produits actuellement. | — |
| `producer.cannotOrder` | Producteur indisponible | — |
| `product.inStock` | En stock | Ipo dukani |
| `presence.now` | Actif à l'instant | — |
| `presence.minutes` | Actif il y a {n} min | — |
| `presence.hours` | Actif il y a {n} h | — |
| `presence.yesterday` | Actif hier | — |
| `presence.days` | Actif il y a {n} jours | — |
| `presence.old` | Actif il y a plus d'un mois | — |
| `time.daysHours` | {d} j {h} h | — |
| `time.hoursMinutes` | {h} h {m} min | — |
| `time.minutes` | {m} min | dakika {m} |
| `time.lessThanMinute` | moins d'une minute | — |
| `availability.title` | Disponibilité des commandes | Upatikanaji wa maagizo |
| `availability.toggle` | Je suis disponible pour recevoir des commandes | Ninapatikana kupokea maagizo |
| `availability.onNote` | Vous pouvez recevoir des commandes. | Unaweza kupokea maagizo. |
| `availability.offNote` | Vous ne recevrez pas de nouvelles commandes jusqu'à votre réactivation. | Hutapokea maagizo mapya hadi utakapowasha tena. |
| `availability.offUntilNote` | Vous ne recevrez pas de nouvelles commandes jusqu'au {date}, puis vous serez de nouveau disponible automatiquement. | — |
| `availability.until` | Indisponible jusqu'au (facultatif) | — |
| `availability.untilHint` | Sans date, vous restez indisponible jusqu'à ce que vous vous réactiviez. | — |
| `availability.existing` | Vos commandes déjà reçues restent à traiter normalement. | — |
| `availability.save` | Enregistrer | Hifadhi |
| `availability.saved` | Disponibilité mise à jour. | — |
| `availability.error` | Impossible de mettre à jour votre disponibilité pour le moment. | — |
| `availability.invalidDate` | Choisissez une date future. | — |
| `availability.bannerTitle` | Vous êtes actuellement indisponible | Kwa sasa hupatikani |
| `availability.reactivate` | Me rendre disponible | Nipatikane tena |
| `attention.title` | Commandes nécessitant votre attention | Maagizo yanayohitaji umakini wako |
| `attention.one` | 1 commande en attente de votre confirmation | — |
| `attention.many` | {n} commandes en attente de votre confirmation | — |
| `attention.empty` | Aucune commande n'attend votre confirmation. | — |
| `attention.product` | Produit | Bidhaa |
| `attention.quantity` | Quantité | Kiasi |
| `attention.buyer` | Acheteur | Mnunuzi |
| `attention.amount` | Montant | Kiasi cha pesa |
| `attention.remaining` | Temps restant | Muda uliobaki |
| `timeline.created` | Commande créée | Agizo limeundwa |
| `timeline.paymentConfirmed` | Paiement confirmé | Malipo yamethibitishwa |
| `timeline.paymentPending` | Paiement en attente | — |
| `timeline.producerConfirmation` | Confirmation du producteur | Uthibitisho wa mzalishaji |
| `timeline.preparing` | Préparation | Maandalizi |
| `timeline.ready` | Commande prête | Agizo liko tayari |
| `timeline.delivery` | Livraison | Uwasilishaji |
| `timeline.delivered` | Livrée | Limewasilishwa |
| `timeline.completed` | Terminée | Limekamilika |
| `timeline.expired` | Confirmation non reçue : commande expirée | — |
| `timeline.rejected` | Commande refusée par le producteur | — |
| `timeline.cancelled` | Commande annulée | — |
| `timeline.waiting` | En attente | Linasubiri |
| `timeline.inProgress` | En cours | Linaendelea |
| `timeline.label` | Suivi de la commande | Ufuatiliaji wa agizo |
| `notif.unread` | Non lue | Haijasomwa |
| `notif.read` | Lue | Imesomwa |
| `notif.markRead` | Marquer comme lue | — |
| `notif.markAll` | Tout marquer comme lu | — |
| `notif.all` | Toutes | Zote |
| `notif.onlyUnread` | Non lues | Ambazo hazijasomwa |
| `notif.onlyRead` | Lues | Zilizosomwa |
| `notif.allTypes` | Tous types | — |
| `notif.cat.order` | Commandes | Maagizo |
| `notif.cat.payment` | Paiements | Malipo |
| `notif.cat.delivery` | Livraisons | Uwasilishaji |
| `notif.cat.agrimatch` | Agri-Match | Agri-Match |
| `notif.cat.agri` | Agriculture | Kilimo |
| `notif.cat.system` | Système | Mfumo |
| `notif.action.viewOrder` | Voir la commande | Tazama agizo |
| `notif.action.confirm` | Confirmer la commande | — |
| `notif.action.alternatives` | Voir les alternatives | — |
| `notif.action.view` | Voir | — |
| `admin.queue.title` | Commandes en attente de confirmation | — |
| `admin.queue.intro` | Surveillance des commandes que les producteurs doivent confirmer avant leur échéance. | — |
| `admin.queue.pending` | En attente | — |
| `admin.queue.soon` | Bientôt expirées | — |
| `admin.queue.expired` | Expirées | — |
| `admin.queue.confirmed` | Confirmées | — |
| `admin.queue.empty` | Aucune commande dans cette catégorie. | — |
| `admin.queue.order` | Commande | — |
| `admin.queue.producer` | Producteur | — |
| `admin.queue.buyer` | Acheteur | — |
| `admin.queue.date` | Créée le | — |
| `admin.queue.deadline` | Échéance | — |
| `admin.queue.remaining` | Temps restant | — |
| `admin.queue.payment` | Paiement | — |
| `admin.queue.status` | Statut | — |
| `admin.queue.lastActivity` | Dernière activité | — |
| `admin.queue.settings` | Délais de confirmation | — |
| `admin.queue.timeout` | Délai de confirmation (heures) | — |
| `admin.queue.reminder` | 1er rappel après (heures) | — |
| `admin.queue.lastReminder` | Dernier rappel avant l'échéance (heures) | — |
| `admin.queue.saveSettings` | Enregistrer les délais | — |
| `admin.queue.settingsSaved` | Délais mis à jour. | — |
| `admin.queue.settingsInvalid` | Valeurs incohérentes : 1er rappel + dernier rappel doivent rester inférieurs au délai total. | — |
| `order.error.producerUnavailable` | Un producteur de votre panier n'accepte pas de nouvelles commandes pour le moment. Retirez ses produits ou réessayez plus tard. | — |
| `lang.partial` | partiel | sehemu |
| `lang.partialHint` | Traduction partielle : les textes manquants s'affichent en français. | — |
