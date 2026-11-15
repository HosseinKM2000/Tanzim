type Listener = () => void;

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

class NetworkService {
  private online = typeof navigator === "undefined" ? true : navigator.onLine;
  private verifying = false;
  private lastVerifyAt = 0;

  private listeners = new Set<Listener>();

  constructor() {
    if (typeof window === "undefined") return;

    window.addEventListener("online", () => {
      this.markOnline();
    });

    window.addEventListener("offline", () => {
      // Double-check against /api/health before locking the UI into offline mode,
      // because mobile WebViews and VPNs can emit transient offline events.
      void this.verifyConnectivity(true);
    });

    window.addEventListener("focus", () => {
      if (!this.online) void this.verifyConnectivity();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !this.online) {
        void this.verifyConnectivity();
      }
    });

    if (!this.online) {
      void this.verifyConnectivity(true);
    }
  }

  markOnline() {
    if (this.online) return;
    this.online = true;
    this.notify();
  }

  markOffline() {
    if (!this.online) return;
    this.online = false;
    this.notify();
  }

  async verifyConnectivity(force = false): Promise<boolean> {
    if (typeof fetch === "undefined") return this.online;
    const now = Date.now();
    if (!force && (this.verifying || now - this.lastVerifyAt < 3_000)) {
      return this.online;
    }
    this.verifying = true;
    this.lastVerifyAt = now;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status > 0) {
        this.markOnline();
        return true;
      }
    } catch {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        this.markOffline();
      } else {
        this.markOffline();
      }
    } finally {
      clearTimeout(timer);
      this.verifying = false;
    }
    return this.online;
  }

  isOnline() {
    return this.online;
  }

  isOffline() {
    return !this.online;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }
}

export const networkService = new NetworkService();
