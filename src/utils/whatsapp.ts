import { Linking } from 'react-native';

/**
 * Open WhatsApp to a phone number, with a web (wa.me) fallback if the WhatsApp
 * app isn't installed. Works on both iOS and Android (iOS requires `whatsapp`
 * in LSApplicationQueriesSchemes — configured in app.config.ts).
 */
export const openWhatsApp = (phone: string, message = ''): Promise<void> => {
  const clean = (phone || '').replace(/[^\d]/g, '');
  const text = encodeURIComponent(message);
  const native = `whatsapp://send?phone=${clean}&text=${text}`;
  const web = `https://wa.me/${clean}?text=${text}`;
  return Linking.openURL(native)
    .catch(() => Linking.openURL(web))
    .catch(() => {});
};
