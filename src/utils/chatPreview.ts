/**
 * Clean one-line preview for a conversation's last message.
 *
 * Product/order cards are stored as JSON in the message `text`, and images/files
 * as attachments — none of that must ever show raw in a chat list. Parse the JSON
 * regardless of the declared `type` (a product can arrive as type 'text').
 */
type TFn = (key: string, defaultValue?: any) => string;

export function chatLastMessagePreview(
  rawText: string | undefined | null,
  type: string | undefined | null,
  t: TFn,
  fallbackProductTitle?: string,
): string {
  const text = (rawText ?? '').trim();

  let parsed: any = null;
  if (text.startsWith('{')) {
    try { parsed = JSON.parse(text); } catch { parsed = null; }
  }

  if (type === 'image') return t('chat.imageMessage', 'Sent an image');
  if (type === 'voice') return t('chat.voiceMessage', 'Voice message');
  if (type === 'file') return t('chat.fileMessage', 'Attachment');

  if (type === 'product' || (parsed && parsed.id && parsed.name)) {
    const name = parsed?.name || fallbackProductTitle || t('chat.product', 'Product');
    return `${t('chat.productLabel', '[Product]')} ${name}`.trim();
  }
  if (type === 'order' || (parsed && parsed.orderNumber)) {
    const num = parsed?.orderNumber ? ` #${parsed.orderNumber}` : '';
    return `${t('chat.orderLabel', '[Order]')}${num}`;
  }

  if (!text) return t('chat.sayHello', 'Say hello 👋');
  if (/^https?:\/\//i.test(text)) return t('chat.attachment', 'Attachment');
  if (parsed) return t('chat.newMessage', 'New message'); // unknown JSON blob
  return text;
}
