import { useEffect } from 'react';

/**
 * SEO par page, sans dépendance : met à jour <title> et les balises meta
 * (description, Open Graph, Twitter) puis restaure les valeurs précédentes au démontage.
 * Les valeurs par défaut de la page d'accueil restent définies dans index.html.
 */
export interface SeoOptions {
  title: string;
  description?: string;
  /** URL ABSOLUE d'une image existante et autorisée (voir image-config.ts). */
  image?: string;
  /** Alt de l'image (og:image:alt). */
  imageAlt?: string;
  /** Empêche l'indexation (pages privées : dashboard, panier…). */
  noindex?: boolean;
}

type MetaKind = 'name' | 'property';

function setMeta(kind: MetaKind, key: string, content: string): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${kind}="${key}"]`);
  const created = !el;
  const previous = el?.getAttribute('content') ?? null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(kind, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
  return () => {
    if (!el) return;
    if (created) el.remove();
    else if (previous !== null) el.setAttribute('content', previous);
  };
}

export function useSeo({ title, description, image, imageAlt, noindex }: SeoOptions): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const restore: (() => void)[] = [];

    restore.push(setMeta('property', 'og:title', title));
    restore.push(setMeta('name', 'twitter:title', title));
    restore.push(setMeta('property', 'og:type', 'website'));
    if (description) {
      restore.push(setMeta('name', 'description', description));
      restore.push(setMeta('property', 'og:description', description));
      restore.push(setMeta('name', 'twitter:description', description));
    }
    if (image) {
      restore.push(setMeta('property', 'og:image', image));
      restore.push(setMeta('name', 'twitter:image', image));
      restore.push(setMeta('name', 'twitter:card', 'summary_large_image'));
      if (imageAlt) restore.push(setMeta('property', 'og:image:alt', imageAlt));
    }
    if (noindex) restore.push(setMeta('name', 'robots', 'noindex, nofollow'));

    return () => {
      document.title = previousTitle;
      restore.reverse().forEach((fn) => fn());
    };
  }, [title, description, image, imageAlt, noindex]);
}
