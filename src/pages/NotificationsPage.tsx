import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, CheckCheck, ShoppingBag, CreditCard, Truck, Sparkles, Sprout, Info } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardBody, Button } from '@/components/ui';
import { EmptyNotifications, LoadError, OrderSkeleton } from '@/components/orders/OrderStates';
import { toast } from '@/components/ui/toast-store';
import { useAuth } from '@/contexts/auth-context';
import { useLanguage } from '@/contexts/language-context';
import type { Notification } from '@/types';
import { timeAgo } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useSeo } from '@/hooks/useSeo';
import { NOTIFICATIONS_EVENT } from '@/hooks/useUnreadNotifications';
import { NOTIFICATION_CATEGORIES, notificationActionKey, notificationCategory, notificationCategoryKey, type NotificationCategory } from '@/lib/notification-types';

const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = { order: ShoppingBag, payment: CreditCard, delivery: Truck, agrimatch: Sparkles, agri: Sprout, system: Info };
type ReadFilter = 'all' | 'unread' | 'read';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '@/services/notificationService';

export function NotificationsPage() {
  useSeo({ title: 'Notifications | AgriFlow RDC', noindex: true });
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all');
  const { user } = useAuth();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(0);

  const load = useCallback(async (append = false) => {
    if (!user) return;
    const page = append ? pageRef.current + 1 : 0;
    if (append) setLoadingMore(true);
    const result = await fetchNotifications(user.id, page);
    if (result.ok) {
      pageRef.current = page;
      setNotifications((prev) => {
        if (!append) return result.data.items;
        const known = new Set(prev.map((n) => n.id));
        return [...prev, ...result.data.items.filter((n) => !known.has(n.id))]; // pas de doublon si une notification est arrivée entre-temps
      });
      setHasMore(result.data.hasMore);
      setError(null);
    } else {
      setError(result.message);
    }
    setLoading(false);
    setLoadingMore(false);
  }, [user]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const markRead = async (id: string) => {
    const ok = await markNotificationRead(id);
    if (!ok) { toast('error', 'Impossible de marquer cette notification comme lue.'); return; }
    setNotifications((list) => list.map((n) => (n.id === id ? { ...n, is_read: true } : n))); // mise à jour locale : pas de rechargement
    window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
  };

  const markAllRead = async () => {
    if (!user) return;
    const ok = await markAllNotificationsRead(user.id);
    if (!ok) { toast('error', 'Impossible de marquer les notifications comme lues.'); return; }
    setNotifications((list) => list.map((n) => ({ ...n, is_read: true })));
    window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
  };

  const visible = useMemo(() => notifications.filter((n) => (readFilter === 'all' || (readFilter === 'unread' ? !n.is_read : n.is_read)) && (category === 'all' || notificationCategory(n.type) === category)), [notifications, readFilter, category]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<NotificationCategory, number>();
    notifications.forEach((n) => { if (!n.is_read) counts.set(notificationCategory(n.type), (counts.get(notificationCategory(n.type)) ?? 0) + 1); });
    return counts;
  }, [notifications]);

  if (loading) return <DashboardLayout title="Notifications"><OrderSkeleton count={3} /></DashboardLayout>;
  if (error) {
    return (
      <DashboardLayout title="Notifications">
        <LoadError title="Impossible de charger vos notifications" message={error} onRetry={() => { setLoading(true); void load(false); }} />
      </DashboardLayout>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <DashboardLayout title="Notifications">
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-charcoal/60">{unreadCount} non lue{unreadCount > 1 ? 's' : ''}</p>
          {unreadCount > 0 && <Button variant="ghost" size="sm" onClick={() => void markAllRead()}><CheckCheck className="h-4 w-4" aria-hidden="true" /> {t('notif.markAll')}</Button>}
        </div>

        {notifications.length > 0 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrer les notifications">
            {([['all', t('notif.all')], ['unread', t('notif.onlyUnread')], ['read', t('notif.onlyRead')]] as [ReadFilter, string][]).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={readFilter === id} onClick={() => setReadFilter(id)} className={cn('inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', readFilter === id ? 'border-brand-600 bg-brand-600 text-white' : 'border-black/[0.08] bg-offwhite text-charcoal/70 hover:border-brand-300')}>{label}</button>
            ))}
            {(['all', ...NOTIFICATION_CATEGORIES] as (NotificationCategory | 'all')[]).map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={cn('inline-flex min-h-[44px] shrink-0 items-center rounded-full border px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', category === c ? 'border-charcoal bg-charcoal text-white' : 'border-black/[0.08] bg-offwhite text-charcoal/70 hover:border-brand-300')}>{c === 'all' ? t('notif.allTypes') : t(notificationCategoryKey(c))}{c !== 'all' && (categoryCounts.get(c) ?? 0) > 0 && <span className="ml-1.5 rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-white" aria-label={`${categoryCounts.get(c)} ${t('notif.unread')}`}>{categoryCounts.get(c)}</span>}</button>
            ))}
          </div>
        )}

        {notifications.length === 0 ? (
          <EmptyNotifications />
        ) : visible.length === 0 ? (
          <p className="rounded-xl border border-black/[0.06] bg-offwhite px-4 py-6 text-center text-sm text-charcoal/60">Aucune notification pour ce filtre.</p>
        ) : (
          <div className="space-y-2">
            {visible.map((n) => (
              <Card key={n.id} className={cn(!n.is_read && 'border-brand-200 bg-brand-50/30')}>
                <CardBody className="flex items-start gap-3">
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', n.is_read ? 'bg-cream text-charcoal/40' : 'bg-brand-100 text-brand-600')}>
                    {(() => { const Icon = CATEGORY_ICONS[notificationCategory(n.type)] ?? Bell; return <Icon className="h-4 w-4" aria-hidden="true" />; })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={cn('text-sm', n.is_read ? 'font-normal text-charcoal/70' : 'font-semibold text-charcoal')}>{n.title}</p>
                        {n.body && <p className="mt-0.5 break-words text-sm text-charcoal/60">{n.body}</p>}
                        <p className="mt-1 text-xs text-charcoal/50">{t(notificationCategoryKey(notificationCategory(n.type)))} · {timeAgo(n.created_at)} · <span className={cn('font-semibold', !n.is_read && 'text-brand-700')}>{n.is_read ? t('notif.read') : t('notif.unread')}</span></p>
                      </div>
                      {!n.is_read && (
                        <button type="button" onClick={() => void markRead(n.id)} aria-label={t('notif.markRead')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-offwhite">
                          <Check className="h-4 w-4 text-charcoal/40" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {n.link && <Link to={n.link} onClick={() => { if (!n.is_read) void markNotificationRead(n.id); }} className="mt-2 inline-flex min-h-[44px] items-center rounded-lg border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{t(notificationActionKey(n.type))} →</Link>}
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
        {hasMore && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" loading={loadingMore} onClick={() => void load(true)}>Voir les notifications plus anciennes</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
