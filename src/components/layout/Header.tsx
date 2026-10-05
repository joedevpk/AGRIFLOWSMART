import { Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import { useLanguage } from '@/contexts/language-context';
import { HomeHeader } from '@/components/layout/HomeHeader';
import { openConsentPreferences } from '@/lib/consent';

/**
 * Barre de navigation des pages internes : exactement la même que celle de l'accueil
 * (mêmes liens, même tiroir mobile, même menu compte), avec un fond plein Forest Green.
 */
export function Header() {
  return <HomeHeader variant="solid" />;
}

export function Footer() {
  const { t } = useLanguage();
  const col = 'inline-flex min-h-[36px] items-center py-1 text-left text-sm text-cream/75 transition-colors duration-200 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 rounded';
  const head = 'mb-3 text-sm font-semibold text-white';
  return (
    <footer className="bg-brand-950 text-cream">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 lg:grid-cols-6">
          <div className="col-span-2 md:col-span-4 lg:col-span-2">
            <Link to="/" className="mb-5 inline-flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Leaf className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="flex flex-col leading-none">
                <span className="text-lg font-bold text-white">AgriFlow</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-brand-300">RDC</span>
              </span>
            </Link>
            <p className="max-w-xs text-lg font-semibold leading-snug text-white text-balance">{t('footer.tagline')}</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-cream/70">{t('footer.aboutText')}</p>
          </div>
          <nav aria-label="Plateforme">
            <h4 className={head}>{t('footer.platform')}</h4>
            <ul>
              <li><Link to="/marketplace" className={col}>{t('nav.marketplace')}</Link></li>
              <li><Link to="/buyer/requests" className={col}>{t('nav.agrimatch')}</Link></li>
              <li><Link to="/comment-ca-marche" className={col}>{t('nav.howItWorks')}</Link></li>
              <li><Link to="/agriguide" className={col}>AgriGuide</Link></li>
            </ul>
          </nav>
          <nav aria-label="Pour qui">
            <h4 className={head}>{t('footer.forWho')}</h4>
            <ul>
              <li><Link to="/producers" className={col}>{t('nav.producers')}</Link></li>
              <li><Link to="/buyers" className={col}>{t('nav.buyers')}</Link></li>
              <li><Link to="/cooperatives" className={col}>Coopératives</Link></li>
              <li><Link to="/entreprises" className={col}>Entreprises</Link></li>
              <li><Link to="/producer/products/new" className={col}>{t('nav.sell')}</Link></li>
            </ul>
          </nav>
          <nav aria-label="Compte et aide">
            <h4 className={head}>{t('footer.account')}</h4>
            <ul>
              <li><Link to="/login" className={col}>{t('nav.login')}</Link></li>
              <li><Link to="/register" className={col}>{t('nav.register')}</Link></li>
              <li><Link to="/dashboard" className={col}>{t('nav.dashboard')}</Link></li>
              <li><Link to="/help" className={col}>Centre d'aide</Link></li>
              <li><Link to="/contact" className={col}>Contact</Link></li>
              <li><Link to="/comment-ca-marche" className={col}>À propos d'AgriFlow</Link></li>
            </ul>
          </nav>
          <nav aria-label="Informations et confiance" className="col-span-2 md:col-span-2 lg:col-span-1">
            <h4 className={head}>Informations &amp; confiance</h4>
            <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-1">
              <li><Link to="/confiance" className={col}>Centre de confiance</Link></li>
              <li><Link to="/confidentialite" className={col}>Politique de confidentialité</Link></li>
              <li><Link to="/conditions" className={col}>Conditions d'utilisation</Link></li>
              <li><Link to="/cookies" className={col}>Politique de cookies</Link></li>
              <li><button type="button" onClick={openConsentPreferences} className={col}>Gestion des cookies</button></li>
              <li><Link to="/remboursement" className={col}>Politique de remboursement</Link></li>
              <li><Link to="/confidentialite#droits" className={col}>Protection des données</Link></li>
            </ul>
          </nav>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-white/10 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-cream/65">{t('footer.demoData')}</p>
          <p className="text-xs text-cream/60">© {new Date().getFullYear()} AgriFlow RDC</p>
        </div>
      </div>
    </footer>
  );
}
