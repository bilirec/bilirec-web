/// <reference lib="webworker" />

/**
 * Custom Service Worker for BiliRec
 * Built with vite-plugin-pwa (injectManifest strategy).
 * self.__WB_MANIFEST is replaced at build time with the precache manifest.
 */

import { sharedStore } from "@/lib/shared-store";
import { resources } from "@/i18n/resources";
import { normalizeLanguage, LANGUAGE_STORAGE_KEY, type AppLanguage } from "@/lib/language";

declare const self: ServiceWorkerGlobalScope & {
  // Injected by vite-plugin-pwa at build time
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// ── Type helpers (not in standard webworker lib) ──────────
interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

interface ExtendedNotificationOptions extends NotificationOptions {
  actions?: readonly NotificationAction[];
  renotify?: boolean;
}

// ── Push Payload Type ────────────────────────────────────────
interface PushPayload {
  type: string;
  room_id: number;
  streamer_name: string;
  room_title: string;
  message: string;
  timestamp: number;
}

function isPushPayload(value: unknown): value is PushPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    typeof v.room_id === "number" &&
    typeof v.streamer_name === "string" &&
    typeof v.room_title === "string" &&
    typeof v.message === "string" &&
    typeof v.timestamp === "number"
  );
}

// ── Constants ──────────────────────────────────────────────
const CACHE_NAME = "bilirec-cache-v2";
const APP_SUBSCRIBE_URL = "/?tab=subscribe";
const PUSH_PUBLIC_KEY_PATH = "/notify/public-key";
const PUSH_SUBSCRIBE_PATH = "/notify/subscription";

/** Resolve an API path against the user-configured server URL stored in IndexedDB. */
async function resolveApiUrl(path: string): Promise<string> {
  const base = await sharedStore.get<string>("server-url");
  if (!base) {
    // Fall back to same-origin (works when PWA and backend share an origin)
    return path;
  }
  return base.replace(/\/$/, "") + path;
}

// ── Install: precache all build assets ────────────────────
self.addEventListener("install", (event) => {
  console.debug("[SW] install fired");

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const urls = self.__WB_MANIFEST.map((entry) => entry.url);
      console.debug(`[SW] precaching ${urls.length} assets`);

      // Cache one-by-one to avoid all-or-nothing failure
      const results = await Promise.allSettled(
        urls.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[SW] failed to precache:", url, err);
            throw err;
          })
        )
      );

      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        console.warn(`[SW] ${failed}/${urls.length} assets failed to precache`);
      }
    })
  );

  // Do NOT call skipWaiting() here.
  // The page controls when to activate the new SW via SKIP_WAITING message.
});

// ── Activate: clean old caches ────────────────────────────
self.addEventListener("activate", (event) => {
  console.debug("[SW] activate fired");

  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.debug("[SW] deleting old cache:", name);
            return caches.delete(name);
          })
      )
    )
  );

  // Take control of all clients immediately after activation
  event.waitUntil(self.clients.claim());
});

// ── Message: handle SKIP_WAITING from page ────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    console.debug("[SW] SKIP_WAITING received, activating new SW");
    self.skipWaiting();
  }
});

// ── Fetch: network-first with runtime cache fallback ──────
self.addEventListener("fetch", (event) => {
  const fetchEvent = event as FetchEvent;
  const { request } = fetchEvent;

  // Only handle GET requests
  if (request.method !== "GET") {
    return;
  }

  // Only handle same-origin requests
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip precache-related requests (workbox internal)
  if (url.pathname.startsWith("/workbox-")) {
    return;
  }

  // First-party analytics proxy — always hit the network, never cache.
  if (url.pathname === "/m/s.js" || url.pathname.startsWith("/m/api/")) {
    return;
  }

  fetchEvent.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for runtime fallback
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          const fallbackBodyPromise = swT('sw.offlineResource');
          const fallbackStatusPromise = swT('sw.serviceUnavailable');
          return Promise.all([fallbackBodyPromise, fallbackStatusPromise]).then(([body, statusText]) =>
            new Response(body, {
              status: 503,
              statusText
            })
          );
        });
      })
  );
});

// ── Push ──────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  console.debug("[SW] push received");
  const pushEvent = event as PushEvent;
  const payload = parsePushPayload(pushEvent.data);
  console.debug("[SW] push payload:", JSON.stringify(payload));

  if (!payload) {
    console.warn("[SW] invalid or missing push payload, skipping notification");
    return;
  }

  const roomId = payload.room_id;

  pushEvent.waitUntil(
    (async () => {
      const notification = await buildLiveNotification(payload);
      const actions = await buildNotificationActions();

      const notificationOptions: ExtendedNotificationOptions = {
    body: notification.body,
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    tag: notification.tag,
    data: {
      eventType: payload.type,
      streamerName: payload.streamer_name,
      roomTitle: payload.room_title,
      eventTimestamp: payload.timestamp,
      roomId,
      appUrl: APP_SUBSCRIBE_URL,
      liveUrl: roomId ? `https://live.bilibili.com/${roomId}` : null
    },
        actions,
        renotify: true
      };

      console.debug(
        "[SW] showNotification:",
        notification.title,
        notificationOptions
      );
      await self.registration.showNotification(notification.title, notificationOptions);
    })()
  );
});

// ── Notification Click ────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  const notificationEvent = event as NotificationEvent;
  const data = notificationEvent.notification.data || {};
  const roomId = data.roomId;
  const appUrl =
    typeof data.appUrl === "string" ? data.appUrl : APP_SUBSCRIBE_URL;
  const liveUrl =
    data.liveUrl || (roomId ? `https://live.bilibili.com/${roomId}` : null);
  const action = notificationEvent.action;

  console.debug(
    "[SW] notificationclick action:",
    action,
    "data:",
    JSON.stringify(data)
  );

  notificationEvent.notification.close();

  notificationEvent.waitUntil(
    (async () => {
      if (action === "open-live" && liveUrl) {
        await self.clients.openWindow(liveUrl);
      } else {
        // Build target URL with pinnedRoom so it survives page reload
        const targetUrl = new URL(appUrl ?? APP_SUBSCRIBE_URL, self.location.origin);
        if (roomId) targetUrl.searchParams.set("pinnedRoom", String(roomId));
        const targetUrlStr = targetUrl.toString();

        const clientList = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true
        });
        const existingClient = clientList.find((client) =>
          client.url.startsWith(self.location.origin)
        );
        if (existingClient) {
          // Only navigate if not already on the app (avoids unnecessary reload)
          const clientUrl = new URL(existingClient.url);
          const isOnApp = clientUrl.pathname === targetUrl.pathname;
          if (!isOnApp && typeof existingClient.navigate === "function") {
            await existingClient.navigate(targetUrlStr);
          }
          await existingClient.focus();
          // postMessage as secondary mechanism (works when no reload occurs)
          existingClient.postMessage({
            type: "notification-click",
            roomId,
            tab: "subscribe",
            action: action || "default"
          });
        } else {
          await self.clients.openWindow(targetUrlStr);
        }
      }
    })()
  );
});

// ── Push Subscription Change ──────────────────────────────
self.addEventListener("pushsubscriptionchange", (event) => {
  console.debug("[SW] pushsubscriptionchange fired");
  const changeEvent = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
  };
  console.debug(
    "[SW] old subscription:",
    changeEvent.oldSubscription?.endpoint ?? null
  );
  console.debug(
    "[SW] new subscription:",
    changeEvent.newSubscription?.endpoint ?? null
  );
  changeEvent.waitUntil(handlePushSubscriptionChange(changeEvent));
});

// ── Helpers ───────────────────────────────────────────────

function parsePushPayload(
  data: PushMessageData | null | undefined
): PushPayload | null {
  if (!data) {
    return null;
  }

  try {
    const parsed: unknown = data.json();
    if (!isPushPayload(parsed)) {
      console.warn("[SW] push payload does not match expected shape:", parsed);
      return null;
    }
    return parsed;
  } catch {
    console.warn("[SW] failed to parse push payload as JSON:", data.text());
    return null;
  }
}

function getInterpolationTemplate(key: string, language: AppLanguage): string {
  const dict = resources[language].common as Record<string, any>;
  return key.split('.').reduce((acc: any, part: string) => acc?.[part], dict) ?? key;
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(values[name] ?? ''));
}

async function getSwLanguage(): Promise<AppLanguage> {
  const stored = await sharedStore.get<string>(LANGUAGE_STORAGE_KEY);
  return normalizeLanguage(stored);
}

async function swT(key: string, values: Record<string, string | number> = {}): Promise<string> {
  const language = await getSwLanguage();
  return interpolate(getInterpolationTemplate(key, language), values);
}

async function buildLiveNotification(payload: PushPayload) {
  const eventType = payload.type || "live_detected";
  const roomId = payload.room_id;
  const streamer = payload.streamer_name || (await swT('sw.defaultStreamer'));
  const roomTitle = payload.room_title || "";

  const titleKey = (() => {
    switch (true) {
      case eventType === "live_auto_record_started":
        return "sw.titleAutoRecord";
      case eventType === "live_auto_record_failed":
        return "sw.titleAutoRecordFailed";
      case eventType === "live_ended":
        return "sw.titleLiveEnded";
      case eventType === "live_record_stopped":
        return "sw.titleRecordStopped";
      case eventType === "live_detected":
        return "sw.titleLive";
      default:
        return "sw.unknownEvent";
    }
  })();
  const title = await swT(titleKey, { streamer });

  const bodyParts: string[] = [];
  if (!["live_ended", "live_record_stopped"].includes(eventType) && roomTitle) {
    bodyParts.push(truncateNotificationText(singleLine(roomTitle), 60));
  } else if (payload.timestamp) {
    const date = new Date(payload.timestamp * 1000);
    const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    bodyParts.push(await swT('sw.atTime', { time: timeStr }));
  }

  const body = bodyParts.join("\n") || (await swT('sw.bodyDefault'));

  return {
    title,
    body,
    tag: roomId ? `room-${roomId}-${eventType}` : `bilirec-${eventType}`
  };
}

function singleLine(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateNotificationText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

async function buildNotificationActions(): Promise<NotificationAction[]> {
  // Only one action button to avoid the Android Chrome PWA bug where
  // event.action always resolves to the last action regardless of which
  // button was actually clicked.
  // Clicking the notification body (action === "") opens the app instead.
  return [{ action: "open-live", title: await swT('sw.actionOpenLive') }];
}

async function handlePushSubscriptionChange(event: {
  oldSubscription?: PushSubscription | null;
  newSubscription?: PushSubscription | null;
}): Promise<void> {
  try {
    let subscription = event.newSubscription;

    if (!subscription) {
      const config = await fetchPushPublicKeyConfig();
      if (!config.enabled || !config.public_key) {
        return;
      }

      subscription = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(
          config.public_key
        ) as BufferSource
      });
    }

    await syncSubscriptionToServer(subscription);
  } catch (error) {
    console.error(
      "Failed to recover push subscription in service worker:",
      error
    );
    await notifyClientsPushResubscribeRequired();
  }
}

async function fetchPushPublicKeyConfig(): Promise<{
  enabled: boolean;
  public_key?: string;
}> {
  const url = await resolveApiUrl(PUSH_PUBLIC_KEY_PATH);
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch push public key: ${response.status}`);
  }

  return response.json();
}

async function syncSubscriptionToServer(
  subscription: PushSubscription
): Promise<void> {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const auth = json.keys?.auth;
  const p256dh = json.keys?.p256dh;

  if (!endpoint || !auth || !p256dh) {
    throw new Error("Invalid push subscription payload");
  }

  const url = await resolveApiUrl(PUSH_SUBSCRIBE_PATH);
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      endpoint,
      keys: {
        auth,
        p256dh
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to sync push subscription: ${response.status}`);
  }
}

async function notifyClientsPushResubscribeRequired(): Promise<void> {
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  windowClients.forEach((client) => {
    client.postMessage({ type: "push-resubscribe-required" });
  });
}

function base64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

// Required by vite-plugin-pwa injectManifest to avoid tree-shaking
export {};
