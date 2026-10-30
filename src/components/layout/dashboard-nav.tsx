import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Package, Store, ShoppingBag, Inbox, MessageSquare, CreditCard, Truck, Bell,
  User, MapPin, BookOpen, CalendarDays, Sparkles, ShoppingCart, LineChart, LifeBuoy, Mail, Heart, ShieldCheck, Percent, Landmark,
} from 'lucide-react';
import type { UserRole } from '@/types';

/**
 * Navigation du tableau de bord — UNIQUEMENT des routes qui existent dans App.tsx.
 * Entrées demandées mais sans page réelle (masquées volontairement tant qu'elles n'existent pas) :
 * « Mes clients », « Mes cultures », « Analyse de terrain » (l'analyse se fait dans le détail d'une parcelle),
 * « Paramètres ».
 */
export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** Affiche le compteur de notifications non lues. */
  badge?: 'notifications';
}

export interface NavSection {
  title: string | null;
  items: NavItem[];
}

const help: NavSection = {
  title: 'Aide',
  items: [
    { label: 'Centre d\'aide', path: '/help', icon: LifeBuoy },
    { label: 'Contacter AgriFlow', path: '/contact', icon: Mail },
  ],
};

export const PRODUCER_NAV: NavSection[] = [
  { title: 'Accueil', items: [{ label: 'Vue d\'ensemble', path: '/dashboard', icon: LayoutDashboard }] },
  {
    title: 'Mon activité',
    items: [
      { label: 'Mes produits', path: '/producer/products', icon: Package },
      { label: 'Mes commandes', path: '/producer/orders', icon: ShoppingBag },
      { label: 'Mes ventes', path: '/producer/sales', icon: LineChart },
      { label: 'Paiements', path: '/payments', icon: CreditCard },
      { label: 'Livraisons', path: '/deliveries', icon: Truck },
    ],
  },
  {
    title: 'Mon agriculture',
    items: [
      { label: 'Mes parcelles', path: '/plots', icon: MapPin },
      { label: 'AgriGuide', path: '/agriguide', icon: BookOpen },
      { label: 'Calendrier agricole', path: '/calendar', icon: CalendarDays },
    ],
  },
  {
    title: 'Opportunités',
    items: [
      { label: 'Agri-Match · demandes', path: '/producer/requests', icon: Sparkles },
      { label: 'Marketplace', path: '/marketplace', icon: Store },
      { label: 'Favoris', path: '/favorites', icon: Heart },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Messages', path: '/messages', icon: MessageSquare },
      { label: 'Notifications', path: '/notifications', icon: Bell, badge: 'notifications' },
    ],
  },
  { title: 'Compte', items: [{ label: 'Mon profil', path: '/profile', icon: User }] },
  help,
];

export const BUYER_NAV: NavSection[] = [
  { title: 'Accueil', items: [{ label: 'Vue d\'ensemble', path: '/dashboard', icon: LayoutDashboard }] },
  {
    title: 'Mes achats',
    items: [
      { label: 'Rechercher', path: '/marketplace', icon: Store },
      { label: 'Favoris', path: '/favorites', icon: Heart },
      { label: 'Mes demandes', path: '/buyer/requests', icon: Inbox },
      { label: 'Panier', path: '/cart', icon: ShoppingCart },
      { label: 'Mes commandes', path: '/buyer/orders', icon: ShoppingBag },
      { label: 'Fournisseurs', path: '/buyer/suppliers', icon: Package },
      { label: 'Paiements', path: '/payments', icon: CreditCard },
      { label: 'Livraisons', path: '/deliveries', icon: Truck },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Messages', path: '/messages', icon: MessageSquare },
      { label: 'Notifications', path: '/notifications', icon: Bell, badge: 'notifications' },
    ],
  },
  { title: 'Compte', items: [{ label: 'Mon profil', path: '/profile', icon: User }] },
  help,
];

export const ADMIN_NAV: NavSection[] = [
  { title: 'Administration', items: [{ label: 'Administration', path: '/admin', icon: ShieldCheck }, { label: 'Finance', path: '/admin/finance', icon: Landmark }, { label: 'Commissions', path: '/admin/commissions', icon: Percent }] },
  ...PRODUCER_NAV,
];

export function navFor(role: UserRole | undefined): NavSection[] {
  if (role === 'admin') return ADMIN_NAV;
  return role === 'buyer' ? BUYER_NAV : PRODUCER_NAV;
}

export function isNavActive(pathname: string, path: string): boolean {
  if (path === '/dashboard') return pathname === '/dashboard';
  return pathname === path || pathname.startsWith(`${path}/`);
}
