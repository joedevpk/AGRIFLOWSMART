/** Résultat uniforme des services : jamais d'exception à intercepter côté composant. */
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export function success<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function failure<T = never>(code: string, message: string): ServiceResult<T> {
  return { ok: false, code, message };
}

export const GENERIC_LOAD_ERROR = 'Nous n\'avons pas pu charger les données. Vérifiez votre connexion puis réessayez.';
