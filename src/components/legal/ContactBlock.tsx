import { Link } from 'react-router-dom';
import { Mail, Phone, MessageCircle, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CONTACT_CHANNELS, HAS_CONTACT_CHANNELS, type ContactChannel } from '@/lib/site-contact';
import { Todo } from './blocks';

const ICONS: Record<ContactChannel['id'], LucideIcon> = { email: Mail, phone: Phone, whatsapp: MessageCircle, address: MapPin };

/**
 * Coordonnées officielles : uniquement celles définies via VITE_CONTACT_* (voir .env.example).
 * Aucune coordonnée n'est inventée ; sans configuration, un TODO explicite est affiché.
 */
export function ContactBlock({ topic }: { topic: string }) {
  if (!HAS_CONTACT_CHANNELS) {
    return (
      <Todo>
        <p>Aucun canal de contact officiel n'est encore configuré (variables <code>VITE_CONTACT_EMAIL</code>, <code>VITE_CONTACT_PHONE</code>, <code>VITE_CONTACT_WHATSAPP</code>, <code>VITE_CONTACT_ADDRESS</code>).</p>
        <p>À renseigner avant production : {topic}. En attendant, consultez le <Link to="/help">centre d'aide</Link>.</p>
      </Todo>
    );
  }
  return (
    <ul className="not-prose grid gap-3 sm:grid-cols-2">
      {CONTACT_CHANNELS.map((c) => {
        const Icon = ICONS[c.id];
        const body = (<><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700" aria-hidden="true"><Icon className="h-5 w-5" /></span><span className="min-w-0"><span className="block text-xs text-charcoal/60">{c.label}</span><span className="block break-words text-sm font-medium text-charcoal">{c.value}</span></span></>);
        const cls = 'flex min-h-[64px] items-center gap-3 rounded-2xl border border-black/[0.08] bg-offwhite p-3';
        return <li key={c.id}>{c.href ? <a href={c.href} className={`${cls} hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}>{body}</a> : <div className={cls}>{body}</div>}</li>;
      })}
    </ul>
  );
}
