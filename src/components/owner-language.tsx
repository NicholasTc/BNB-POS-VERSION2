"use client";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ownerEnglish,
  type OwnerLanguage,
  type OwnerText,
} from "@/lib/owner-language";
const KEY = "lisi.owner-language",
  EVENT = "lisi:owner-language";
let fallback: OwnerLanguage = "id";
function snapshot(): OwnerLanguage {
  try {
    const value = localStorage.getItem(KEY);
    return value === "en" || value === "id" ? value : fallback;
  } catch {
    return fallback;
  }
}
function subscribe(update: () => void) {
  const storage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) update();
  };
  window.addEventListener(EVENT, update);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, update);
    window.removeEventListener("storage", storage);
  };
}
export function applyOwnerLanguage(language: OwnerLanguage) {
  fallback = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {
    /* Account preference remains durable on the server. */
  }
  window.dispatchEvent(new Event(EVENT));
}
const Context = createContext<{
  language: OwnerLanguage;
  t: (text: OwnerText) => string;
} | null>(null);
export function OwnerLanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(
    subscribe,
    snapshot,
    () => "id" as const,
  );
  return (
    <Context.Provider
      value={{
        language,
        t: (text) => (language === "en" ? ownerEnglish[text] : text),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useOwnerLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error("Owner language provider missing");
  return value;
}
