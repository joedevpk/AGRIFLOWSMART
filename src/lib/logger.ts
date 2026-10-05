/**
 * Journalisation structurée (une ligne JSON par événement) — compatible avec un outil de monitoring externe
 * (voir docs/MONITORING.md : `registerLogSink`). Rien n'est envoyé à un service tiers tant qu'aucun sink n'est branché.
 *
 * Jamais consigné : mot de passe, jeton, secret, clé service_role, clé CinetPay, numéro de carte, PIN/OTP, téléphone.
 * Les champs sensibles sont masqués par CLÉ (`password`, `token`…) et par FORME (JWT, suites de 13 à 19 chiffres).
 * Les détails techniques vont dans les logs ; l'interface n'affiche jamais de stack trace.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Fonction / module émetteur (ex. 'orderService.createOrder'). */
  fn?: string;
  /** Identifiant de requête / de référence métier lorsqu'il existe (ex. référence interne de paiement). */
  requestId?: string;
  [key: string]: unknown;
}

export interface LogEvent {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  route: string | null;
  userId: string | null;
  requestId?: string;
  extra?: Record<string, unknown>;
}

const SENSITIVE_KEY = /(pass(word)?|token|secret|authorization|api[-_]?key|service[-_]?role|cvv|cvc|\bpin\b|otp|card|phone|msisdn|cookie)/i;
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const LONG_DIGITS = /\b\d(?:[ -]?\d){12,18}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Masque les motifs sensibles dans un texte libre. */
export function redactText(text: string): string {
  return text.replace(JWT_LIKE, '[jwt masqué]').replace(BEARER, 'Bearer [masqué]').replace(LONG_DIGITS, '[nombre masqué]');
}

/** Copie profonde (profondeur bornée) où toute clé sensible est remplacée par « [masqué] ». */
export function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value).slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return redactText(value.message).slice(0, 500);
  if (depth >= 3) return '[profondeur max]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[masqué]' : redactValue(v, depth + 1);
    }
    return out;
  }
  return String(typeof value);
}

type LogSink = (event: LogEvent) => void;
const sinks = new Set<LogSink>();
let currentUserId: string | null = null;

/** Branche un outil externe (Sentry, Logtail…). Retourne la fonction de désinscription. */
export function registerLogSink(sink: LogSink): () => void {
  sinks.add(sink);
  return () => { sinks.delete(sink); };
}

/** Identifiant de l'utilisateur connecté, joint aux événements (jamais d'e-mail ni de téléphone). */
export function setLogUser(id: string | null): void {
  currentUserId = id;
}

function currentRoute(): string | null {
  return typeof window === 'undefined' ? null : window.location.pathname;
}

export function buildEvent(level: LogLevel, context: string, message: unknown, extra?: LogContext, now: Date = new Date()): LogEvent {
  const text = message instanceof Error ? message.message : typeof message === 'string' ? message : 'Erreur inconnue';
  const { requestId, ...rest } = extra ?? {};
  const event: LogEvent = {
    timestamp: now.toISOString(),
    level,
    context,
    message: redactText(text).slice(0, 500),
    route: currentRoute(),
    userId: currentUserId,
  };
  if (typeof requestId === 'string') event.requestId = redactText(requestId).slice(0, 100);
  if (Object.keys(rest).length > 0) event.extra = redactValue(rest) as Record<string, unknown>;
  return event;
}

export function log(level: LogLevel, context: string, message: unknown, extra?: LogContext): void {
  const event = buildEvent(level, context, message, extra);
  const line = JSON.stringify({ app: 'agriflow', ...event });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'info') console.info(line);
  else if (import.meta.env?.DEV) console.debug(line);
  sinks.forEach((sink) => { try { sink(event); } catch { /* un sink défaillant ne doit jamais casser l'application */ } });
}

/** Compatible avec les anciens appels `reportError(contexte, erreur)` ; accepte un contexte enrichi. */
export function reportError(context: string, error: unknown, extra?: LogContext): void {
  log('error', context, error, extra);
}

export function reportWarning(context: string, message: unknown, extra?: LogContext): void {
  log('warn', context, message, extra);
}
