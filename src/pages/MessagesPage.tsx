import { reportError } from '@/lib/logger';
import { MESSAGE_WITH_PARTIES } from '@/lib/columns';
import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, MessageSquare } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Avatar, Button, EmptyState, LoadingState } from '@/components/ui';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';
import type { Message, Profile } from '@/types';
import { timeAgo } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface Conversation {
  otherUser: Profile;
  messages: Message[];
  lastMessage: Message | null;
}

/** Fenêtre de messages chargée (les plus récents). Les conversations sont reconstruites côté client à partir d'elles : une pagination par conversation reste à faire. */
const MESSAGES_WINDOW = 500;

export function MessagesPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const withUser = searchParams.get('with');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from('messages')
      .select(MESSAGE_WITH_PARTIES)
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_WINDOW)
      .then(async ({ data, error }) => {
        if (error) { reportError('MessagesPage.load', error.message, { fn: 'loadMessages' }); toast('error', 'Impossible de charger vos messages. Réessayez dans un instant.'); }
        const msgs = (data as unknown as (Message & { sender: Profile; receiver: Profile })[]) ?? [];
        const convMap = new Map<string, Conversation>();
        msgs.forEach((m) => {
          const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
          const otherUser = m.sender_id === user.id ? m.receiver : m.sender;
          if (!convMap.has(otherId)) convMap.set(otherId, { otherUser, messages: [], lastMessage: null });
          const conv = convMap.get(otherId)!;
          conv.messages.unshift(m);
          if (!conv.lastMessage) conv.lastMessage = m;
        });
        const convs = Array.from(convMap.values()).sort((a, b) => {
          const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
          const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
          return bTime - aTime;
        });
        // Arrivée depuis « Contacter » : ouvre la conversation avec ce producteur,
        // même s'il n'existe encore aucun message avec lui.
        if (withUser && withUser !== user.id && !convs.some((c) => c.otherUser.user_id === withUser)) {
          const { data: other } = await supabase
            .from('profiles')
            .select('id, user_id, role, buyer_type, full_name, province, city, bio, avatar_url, is_verified, created_at, updated_at')
            .eq('user_id', withUser)
            .maybeSingle();
          if (other) convs.unshift({ otherUser: other as Profile, messages: [], lastMessage: null });
        }
        setConversations(convs);
        if (withUser && convs.some((c) => c.otherUser.user_id === withUser)) setActiveConv(withUser);
        else if (convs.length > 0) setActiveConv(convs[0].otherUser.user_id);
        setLoading(false);
      });
  }, [user, withUser]);

  const activeConversation = conversations.find((c) => c.otherUser.user_id === activeConv);

  const handleSend = async () => {
    if (!user || !activeConv || !newMessage.trim()) return;
    setSending(true);
    const { error } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: activeConv,
      content: newMessage.trim(),
    });
    if (error) {
      setSending(false);
      toast('error', 'Le message n\'a pas pu être envoyé. Réessayez.');
      return;
    }
    setNewMessage('');
    setSending(false);
    // Reload
    const { data } = await supabase.from('messages')
      .select(MESSAGE_WITH_PARTIES)
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_WINDOW);
    const msgs = (data as unknown as (Message & { sender: Profile; receiver: Profile })[]) ?? [];
    const convMap = new Map<string, Conversation>();
    msgs.forEach((m) => {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      const otherUser = m.sender_id === user.id ? m.receiver : m.sender;
      if (!convMap.has(otherId)) convMap.set(otherId, { otherUser, messages: [], lastMessage: null });
      const conv = convMap.get(otherId)!;
      conv.messages.unshift(m);
      if (!conv.lastMessage) conv.lastMessage = m;
    });
    setConversations(Array.from(convMap.values()));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  if (loading) return <DashboardLayout title="Messages"><LoadingState /></DashboardLayout>;

  return (
    <DashboardLayout title="Messages">
      <div className="flex h-[calc(100vh-12rem)] rounded-2xl border border-brand-200 overflow-hidden bg-offwhite">
        {/* Conversation list */}
        <div className={cn('w-full sm:w-72 border-r border-brand-200 overflow-y-auto', activeConv && 'hidden sm:block')}>
          {conversations.length === 0 ? (
            <div className="p-6"><EmptyState icon={<MessageSquare className="h-8 w-8" />} title="Aucun message" description="Vos conversations avec les producteurs et acheteurs apparaîtront ici." /></div>
          ) : (
            conversations.map((c) => (
              <button key={c.otherUser.user_id} onClick={() => setActiveConv(c.otherUser.user_id)} className={cn('flex w-full items-center gap-3 p-4 border-b border-brand-100 text-left hover:bg-cream transition-colors', activeConv === c.otherUser.user_id && 'bg-brand-50')}>
                <Avatar name={c.otherUser.full_name} src={c.otherUser.avatar_url} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-charcoal truncate">{c.otherUser.full_name}</p>
                  <p className="text-sm text-charcoal/60 truncate">{c.lastMessage?.content || '—'}</p>
                  <p className="text-xs text-charcoal/40 mt-0.5">{c.lastMessage ? timeAgo(c.lastMessage.created_at) : ''}</p>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {activeConversation ? (
            <>
              <div className="flex items-center gap-3 p-4 border-b border-brand-200">
                <button className="sm:hidden p-1 rounded-lg hover:bg-cream" onClick={() => setActiveConv(null)}>←</button>
                <Avatar name={activeConversation.otherUser.full_name} src={activeConversation.otherUser.avatar_url} size="sm" />
                <div>
                  <p className="font-medium text-charcoal">{activeConversation.otherUser.full_name}</p>
                  <p className="text-xs text-charcoal/60">{activeConversation.otherUser.city || 'RDC'}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeConversation.messages.map((m) => (
                  <div key={m.id} className={cn('flex', m.sender_id === user?.id ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[75%] rounded-2xl px-4 py-2 text-sm', m.sender_id === user?.id ? 'bg-brand-600 text-white' : 'bg-cream text-charcoal/80')}>
                      {m.content}
                      <p className={cn('text-[10px] mt-1', m.sender_id === user?.id ? 'text-brand-100' : 'text-charcoal/40')}>{timeAgo(m.created_at)}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="p-4 border-t border-brand-200 flex gap-2">
                <input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Écrivez un message..." className="flex-1 rounded-xl border border-brand-200 px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10" />
                <Button onClick={handleSend} loading={sending} disabled={!newMessage.trim()}><Send className="h-4 w-4" /></Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center"><EmptyState icon={<MessageSquare className="h-8 w-8" />} title="Sélectionnez une conversation" /></div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
