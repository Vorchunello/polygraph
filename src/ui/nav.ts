import type { MessageKey } from "../i18n/en";

export type ViewId =
  | "home"
  | "words"
  | "study"
  | "playlists"
  | "adapt"
  | "reader"
  | "texts"
  | "background"
  | "inbox"
  | "notes"
  | "ask"
  | "settings";

export interface NavItem {
  id: ViewId;
  icon: string;
  label: MessageKey;
}

// Группы бокового меню. На телефоне внизу только PRIMARY, остальное — в «Ещё».
export const NAV_GROUPS: { label?: MessageKey; items: NavItem[] }[] = [
  { items: [{ id: "home", icon: "⌂", label: "nav.home" }] },
  {
    label: "navg.learn",
    items: [
      { id: "words", icon: "▦", label: "nav.words" },
      { id: "study", icon: "◉", label: "nav.study" },
      { id: "playlists", icon: "♫", label: "nav.playlists" },
      { id: "adapt", icon: "⇄", label: "nav.adapt" },
    ],
  },
  {
    label: "navg.read",
    items: [
      { id: "reader", icon: "❏", label: "nav.reader" },
      { id: "texts", icon: "¶", label: "nav.texts" },
      { id: "background", icon: "≋", label: "nav.background" },
    ],
  },
  {
    label: "navg.think",
    items: [
      { id: "inbox", icon: "✎", label: "nav.inbox" },
      { id: "notes", icon: "✦", label: "nav.notes" },
      { id: "ask", icon: "?", label: "nav.ask" },
    ],
  },
  { items: [{ id: "settings", icon: "⚙", label: "nav.settings" }] },
];

export const PRIMARY: ViewId[] = ["home", "words", "study", "inbox"];
