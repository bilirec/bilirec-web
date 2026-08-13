/**
 * Same-origin Umami proxy.
 *
 * /m/s.js   → {UMAMI_ORIGIN}/script.js
 * /m/api/*  → {UMAMI_ORIGIN}/api/*
 *
 * UMAMI_ORIGIN is a Worker runtime variable (Dashboard or .dev.vars),
 * not a Vite build-time env. Leave it unset to disable the proxy.
 */

interface Env {
  UMAMI_ORIGIN?: string;
}

const SCRIPT_PATH = "/m/s.js";
const API_PREFIX = "/m/api/";

const DROP_REQUEST_HEADERS = new Set([
  "authorization",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "connection",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
]);

function parseOrigin(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const origin = new URL(trimmed);
    if (origin.protocol !== "https:" && origin.protocol !== "http:") {
      return null;
    }
    return origin;
  } catch {
    return null;
  }
}

function resolveTarget(pathname: string, origin: URL): URL | null {
  if (pathname === SCRIPT_PATH) {
    return new URL("/script.js", origin);
  }

  if (pathname.startsWith(API_PREFIX)) {
    return new URL(`/api/${pathname.slice(API_PREFIX.length)}`, origin);
  }

  return null;
}

function copyHeaders(source: Headers, drop: Set<string>): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (drop.has(key.toLowerCase())) {
      return;
    }
    headers.append(key, value);
  });
  return headers;
}

function notFound(): Response {
  return new Response(null, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const origin = parseOrigin(env.UMAMI_ORIGIN);
      if (!origin) {
        return notFound();
      }

      const url = new URL(request.url);
      const target = resolveTarget(url.pathname, origin);
      if (!target) {
        return notFound();
      }

      target.search = url.search;

      const headers = copyHeaders(request.headers, DROP_REQUEST_HEADERS);
      const clientIp = request.headers.get("CF-Connecting-IP");
      if (clientIp) {
        headers.set("X-Forwarded-For", clientIp);
        headers.set("X-Real-IP", clientIp);
      }
      headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
      headers.set("X-Forwarded-Host", url.host);

      const init: RequestInit & { duplex?: "half" } = {
        method: request.method,
        headers,
        redirect: "follow",
      };

      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
        init.duplex = "half";
      }

      const upstream = await fetch(target, init);
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("set-cookie");

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      // Fail closed for /m/* only. Static SPA routes never enter this Worker.
      console.warn("Umami proxy failed:", error);
      return new Response(null, { status: 502 });
    }
  },
};
