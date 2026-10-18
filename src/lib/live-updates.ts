// Signals carry no records or credentials. Every refresh still uses the
// authorized server API; polling covers other devices and unavailable channels.
export const UPDATE_EVENT = "lisi:data-updated";
export const UPDATE_CHANNEL = "lisi-data-updates";
export function notifyDataUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(UPDATE_EVENT));
  try {
    const channel = new BroadcastChannel(UPDATE_CHANNEL);
    channel.postMessage("updated");
    channel.close();
  } catch {
    /* Visible-page polling remains available. */
  }
}
