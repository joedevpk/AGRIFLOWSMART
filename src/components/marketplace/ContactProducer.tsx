import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ButtonSize, ButtonVariant } from '@/components/ui/button-styles';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';

interface ContactProducerButtonProps {
  producerId: string;
  producerName: string;
  productId?: string;
  productName?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  label?: string;
  /** Affiche uniquement l'icône (barres d'actions compactes). */
  iconOnly?: boolean;
  /** Message pré-rempli (par défaut : intérêt pour la production). */
  initialMessage?: string;
  /** Sujet affiché sous le titre de la fenêtre (par défaut : le nom du produit). */
  subject?: string;
}

/**
 * Bouton « Contacter » : ouvre un formulaire de message envoyé via la table
 * `messages` (RLS : sender_id = auth.uid()). Non connecté → redirection vers
 * la connexion, puis retour sur la page d'origine.
 */
export function ContactProducerButton({
  producerId, producerName, productId, productName,
  variant = 'harvest', size = 'md', fullWidth, className, label = 'Contacter', iconOnly, initialMessage, subject,
}: ContactProducerButtonProps) {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (user?.id === producerId) return null;

  const handleOpen = () => {
    if (authLoading) return;
    if (!user) {
      toast('info', 'Connectez-vous pour envoyer un message.');
      navigate('/login', { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    setMessage(
      initialMessage ?? (productName
        ? `Bonjour ${producerName}, je suis intéressé(e) par votre production « ${productName} ». Est-elle toujours disponible ?`
        : `Bonjour ${producerName}, je souhaiterais en savoir plus sur vos productions.`),
    );
    setOpen(true);
  };

  const handleSend = async () => {
    const content = message.trim();
    if (!user || !content) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: producerId,
      product_id: productId ?? null,
      content,
    });
    setSending(false);
    if (error) {
      toast('error', 'Le message n\'a pas pu être envoyé. Réessayez.');
      return;
    }
    toast('success', 'Message envoyé.');
    setOpen(false);
    navigate(`/messages?with=${producerId}`);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        fullWidth={fullWidth}
        className={className}
        onClick={handleOpen}
        aria-label={iconOnly ? `${label} ${producerName}` : undefined}
      >
        <MessageSquare className="h-4 w-4" />
        {!iconOnly && label}
      </Button>

      {open && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`Contacter ${producerName}`}>
          <div className="absolute inset-0 bg-charcoal/50 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-offwhite p-5 pb-safe shadow-lift animate-slide-up">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-charcoal">Contacter {producerName}</h2>
                {(subject ?? productName) && <p className="text-sm text-charcoal/50">À propos de : {subject ?? productName}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="rounded-full p-2 text-charcoal/50 hover:bg-black/5">
                <X className="h-5 w-5" />
              </button>
            </div>
            <label htmlFor="contact-message" className="sr-only">Votre message</label>
            <textarea
              id="contact-message"
              rows={5}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full resize-none rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-sm text-charcoal focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
            />
            <div className="mt-4 flex gap-3 pb-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="button" fullWidth loading={sending} disabled={!message.trim()} onClick={handleSend}>
                <Send className="h-4 w-4" /> Envoyer le message
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
