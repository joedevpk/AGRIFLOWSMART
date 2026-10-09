import { Link } from 'react-router-dom';
import { Store, ShoppingBag, Factory, Building2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Header, Footer } from '@/components/layout/Header';
import { Button, Card, CardBody, PageHero, CTASection } from '@/components/ui';
import { useSeo } from '@/hooks/useSeo';
import { PAGE_IMAGES } from '@/lib/image-config';

export function BuyersPage() {
  useSeo({
    title: 'Pour les acheteurs | AgriFlow RDC',
    description: 'Restaurants, marchés, grossistes, agro-industries : trouvez des fournisseurs agricoles et commandez directement auprès des producteurs de RDC.',
    image: PAGE_IMAGES.buyer.url,
    imageAlt: PAGE_IMAGES.buyer.alt,
  });
  const buyerTypes = [
    { icon: <Store className="h-8 w-8" />, title: 'Restaurants', desc: 'Approvisionnez votre cuisine avec des produits frais, directement du producteur.', points: ['Recherche par produit et par ville', 'Commande directe auprès du producteur', 'Suivi de la commande jusqu\'à la livraison'] },
    { icon: <ShoppingBag className="h-8 w-8" />, title: 'Marchés', desc: 'Diversifiez vos étals avec une large gamme de productions agricoles.', points: ['Comparez les offres de plusieurs producteurs', 'Prix affiché par unité', 'Commandez la quantité voulue'] },
    { icon: <Factory className="h-8 w-8" />, title: 'Grossistes', desc: 'Achetez en grande quantité auprès des producteurs et coopératives.', points: ['Quantités disponibles affichées', 'Contact direct avec le producteur', 'Livraison suivie par statut'] },
    { icon: <Building2 className="h-8 w-8" />, title: 'Agro-industries', desc: 'Sécurisez vos approvisionnements en matières premières agricoles.', points: ['Publiez une demande d\'achat', 'Agri-Match propose les producteurs adaptés', 'Messagerie avec les producteurs'] },
  ];

  return (
    <div className="min-h-screen bg-cream dark:bg-charcoal transition-colors">
      <Header />
      <PageHero image={PAGE_IMAGES.buyer} badge="Pour les acheteurs" title="Trouvez le bon fournisseur, au bon prix" subtitle="Restaurants, marchés, grossistes, agro-industries : accédez directement aux producteurs agricoles de RDC.">
        <Link to="/marketplace"><Button size="xl" variant="sun" className="group font-semibold">Trouver un fournisseur <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" /></Button></Link>
      </PageHero>
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {buyerTypes.map((bt) => (
              <Card key={bt.title} className="h-full">
                <CardBody>
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-5">{bt.icon}</div>
                  <h3 className="text-xl font-semibold text-charcoal">{bt.title}</h3>
                  <p className="mt-2 text-sm text-charcoal/60">{bt.desc}</p>
                  <ul className="mt-5 space-y-2">
                    {bt.points.map((pt) => (
                      <li key={pt} className="flex items-center gap-2 text-sm text-charcoal/70"><CheckCircle2 className="h-4 w-4 text-brand-500" /> {pt}</li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <CTASection title="Trouvez vos prochains fournisseurs" description="Parcourez les produits proposés directement par les producteurs." primary={{ label: 'Explorer la marketplace', to: '/marketplace' }} secondary={{ label: 'Créer un compte', to: '/register' }} />
      <Footer />
    </div>
  );
}
