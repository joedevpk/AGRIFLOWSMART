/**
 * Coordonnées officielles d'AgriFlow.
 *
 * AUCUNE coordonnée n'est codée en dur : le projet n'en définit pas. Elles sont lues
 * dans les variables d'environnement publiques Vite (voir .env.example). Tant qu'une
 * variable est vide, le canal correspondant n'est PAS affiché (rien n'est inventé).
 */
const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const email = clean(import.meta.env.VITE_CONTACT_EMAIL);
const phone = clean(import.meta.env.VITE_CONTACT_PHONE);
const whatsapp = clean(import.meta.env.VITE_CONTACT_WHATSAPP);
const address = clean(import.meta.env.VITE_CONTACT_ADDRESS);

const digits = (v: string) => v.replace(/[^\d]/g, '');

export interface ContactChannel {
  id: 'email' | 'phone' | 'whatsapp' | 'address';
  label: string;
  value: string;
  /** Lien d'action ; absent pour l'adresse. */
  href?: string;
}

function buildChannels(): ContactChannel[] {
  const list: ContactChannel[] = [];
  if (email) list.push({ id: 'email', label: 'E-mail', value: email, href: `mailto:${email}` });
  if (phone) list.push({ id: 'phone', label: 'Téléphone', value: phone, href: `tel:+${digits(phone)}` });
  if (whatsapp) list.push({ id: 'whatsapp', label: 'WhatsApp', value: whatsapp, href: `https://wa.me/${digits(whatsapp)}` });
  if (address) list.push({ id: 'address', label: 'Adresse', value: address });
  return list;
}

export const CONTACT_CHANNELS: ContactChannel[] = buildChannels();

export const HAS_CONTACT_CHANNELS = CONTACT_CHANNELS.length > 0;
