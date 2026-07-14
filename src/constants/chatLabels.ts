/**
 * Preset conversation labels for the Messenger "My label" filter.
 *
 * These are a fixed, curated set (no per-user label management screen yet).
 * A conversation stores the assigned label ids under `labels.user` / `labels.admin`
 * (see the Conversation type + chatService.setConversationLabels).
 *
 * `nameKey` resolves through i18next (chat.labels.*, in all three locales).
 */
export interface ChatLabel {
  id: string;
  color: string;
  nameKey: string;
}

export const CHAT_LABELS: ChatLabel[] = [
  { id: 'important', color: '#EF4444', nameKey: 'chat.labels.important' },
  { id: 'toBuy',     color: '#F59E0B', nameKey: 'chat.labels.toBuy' },
  { id: 'waiting',   color: '#3B82F6', nameKey: 'chat.labels.waiting' },
  { id: 'done',      color: '#22C55E', nameKey: 'chat.labels.done' },
];

export const getChatLabel = (id: string): ChatLabel | undefined =>
  CHAT_LABELS.find((l) => l.id === id);
