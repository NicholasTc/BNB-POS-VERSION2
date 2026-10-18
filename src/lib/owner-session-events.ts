// Presentation invalidation only; all authorization remains server-side.
const EVENT = "lisi:owner-signed-out",
  CHANNEL = "lisi-owner-session";
export function notifyOwnerSignedOut() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("signed-out");
    channel.close();
  } catch {
    /* Polling still checks revocation. */
  }
}
export function subscribeOwnerSignedOut(clear: () => void) {
  window.addEventListener(EVENT, clear);
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      if (event.data === "signed-out") clear();
    };
  } catch {
    /* Polling still checks revocation. */
  }
  return () => {
    window.removeEventListener(EVENT, clear);
    channel?.close();
  };
}
