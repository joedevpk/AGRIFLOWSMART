import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createBackButtonHandler, createDeepLinkHandler } from '@/lib/native/lifecycle';
import { isNativeApp } from '@/lib/native/platform';
import { publicWebUrl } from '@/lib/native/urls';

/**
 * Ponts propres à l'application native (aucun effet sur le Web) :
 *  - bouton Retour Android : retour dans l'historique de l'application, sinon fermeture ;
 *  - liens profonds (`cd.agriflow.rdc://…` ou lien https du site) vers des pages autorisées uniquement.
 */
export function NativeBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    const removers: Array<() => void> = [];
    void (async () => {
      const { App } = await import('@capacitor/app');
      if (cancelled) return;
      const openLink = createDeepLinkHandler({ navigate: (p) => navigate(p), publicOrigin: publicWebUrl });
      const onBack = createBackButtonHandler({
        historyIndex: () => (window.history.state as { idx?: number } | null)?.idx ?? 0,
        goBack: () => navigate(-1),
        exitApp: () => void App.exitApp(),
      });
      const back = await App.addListener('backButton', onBack);
      const open = await App.addListener('appUrlOpen', ({ url }) => { openLink(url); });
      removers.push(() => void back.remove(), () => void open.remove());
      const launch = await App.getLaunchUrl();
      if (launch?.url) openLink(launch.url);
    })();
    return () => { cancelled = true; removers.forEach((r) => r()); };
  }, [navigate]);
  return null;
}
