import type { DeliveryFormData, DeliveryFormErrors } from '@/types';

/**
 * Validation du formulaire de livraison. Les mêmes règles sont réappliquées côté
 * serveur par la RPC `create_order_from_cart` (la validation frontend n'est qu'un
 * confort : elle ne protège rien).
 */

export const EMPTY_DELIVERY: DeliveryFormData = {
  recipient_name: '',
  recipient_phone: '',
  address: '',
  city: '',
  commune: '',
  instructions: '',
};

const PHONE_CHARS = /^\+?[0-9][0-9 ().-]*$/;

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidPhone(value: string): boolean {
  const v = value.trim();
  const digits = phoneDigits(v);
  return PHONE_CHARS.test(v) && digits.length >= 9 && digits.length <= 15;
}

export function validateDelivery(data: DeliveryFormData): DeliveryFormErrors {
  const errors: DeliveryFormErrors = {};
  const name = data.recipient_name.trim();
  const address = data.address.trim();
  const city = data.city.trim();

  if (name.length < 2) errors.recipient_name = 'Indiquez le nom du destinataire.';
  else if (name.length > 120) errors.recipient_name = 'Le nom est trop long (120 caractères maximum).';

  if (!data.recipient_phone.trim()) errors.recipient_phone = 'Indiquez un numéro de téléphone.';
  else if (!isValidPhone(data.recipient_phone)) {
    errors.recipient_phone = 'Numéro invalide. Exemple : +243 812 345 678 ou 0812345678.';
  }

  if (address.length < 3) errors.address = 'Indiquez l\'adresse de livraison.';
  else if (address.length > 300) errors.address = 'L\'adresse est trop longue (300 caractères maximum).';

  if (city.length < 2) errors.city = 'Indiquez la ville de livraison.';
  else if (city.length > 100) errors.city = 'Le nom de la ville est trop long.';

  if (data.commune.trim().length > 100) errors.commune = 'La commune est trop longue.';
  if (data.instructions.trim().length > 500) errors.instructions = 'Les instructions sont trop longues (500 caractères maximum).';

  return errors;
}

export function hasErrors(errors: DeliveryFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Nettoie les espaces avant envoi (le serveur refait sa propre normalisation). */
export function normalizeDelivery(data: DeliveryFormData): DeliveryFormData {
  return {
    recipient_name: data.recipient_name.trim(),
    recipient_phone: data.recipient_phone.trim(),
    address: data.address.trim(),
    city: data.city.trim(),
    commune: data.commune.trim(),
    instructions: data.instructions.trim(),
  };
}
