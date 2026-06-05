import {
  createStartHandler,
  defaultStreamHandler
} from "@tanstack/react-start/server";
import type { Register } from "@tanstack/react-router";
import type { RequestHandler } from "@tanstack/react-start/server";

const STATIC_ASSET_PREFIXES = [
  "/assets/",
  "/features/",
  "/fonts/",
  "/template-snapshots/"
];

const STATIC_ASSET_EXTENSIONS = new Set([
  ".css",
  ".gif",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".otf",
  ".png",
  ".svg",
  ".txt",
  ".ttf",
  ".webp",
  ".woff",
  ".woff2",
  ".xml"
]);

const PUBLIC_HTML_CACHE_CONTROL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
const PRIVATE_CACHE_CONTROL = "no-store";
const PUBLIC_LANDING_PATHS = new Set(["/zh", "/en"]);

type ServerEntry = { fetch: RequestHandler<Register> };
type WaitUntilContext = { waitUntil?: (promise: Promise<unknown>) => void };

function getPathExtension(pathname: string) {
  const filename = pathname.split("/").pop() ?? "";
  const extensionStart = filename.lastIndexOf(".");
  if (extensionStart < 0) return "";
  return filename.slice(extensionStart).toLowerCase();
}

function isStaticAssetPath(pathname: string) {
  return (
    STATIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    STATIC_ASSET_EXTENSIONS.has(getPathExtension(pathname))
  );
}

function respondStaticNotFound() {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function isHtmlRequest(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") || accept.includes("*/*");
}

function isPublicLandingRequest(request: Request, url: URL) {
  return (
    request.method === "GET" &&
    PUBLIC_LANDING_PATHS.has(url.pathname) &&
    isHtmlRequest(request) &&
    !request.headers.has("authorization")
  );
}

function isPrivateDynamicPath(pathname: string) {
  return pathname.startsWith("/app") || pathname.startsWith("/api");
}

function isCacheablePublicHtmlResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  return (
    response.status === 200 &&
    contentType.includes("text/html") &&
    !response.headers.has("set-cookie")
  );
}

function getWorkerContext(args: unknown[]) {
  return args.find(
    (arg): arg is WaitUntilContext =>
      Boolean(arg) && typeof (arg as WaitUntilContext).waitUntil === "function"
  );
}

function getPublicHtmlCacheKey(request: Request) {
  const url = new URL(request.url);
  return new Request(url.toString(), { method: "GET" });
}

function getDefaultCache() {
  return typeof caches === "undefined" ? null : caches.default;
}

async function matchPublicHtmlCache(request: Request, url: URL) {
  if (!isPublicLandingRequest(request, url)) return null;

  const cache = getDefaultCache();
  if (!cache) return null;

  return await cache.match(getPublicHtmlCacheKey(request));
}

function applyWorkerCacheHeaders(request: Request, url: URL, response: Response) {
  const cachedResponse = new Response(response.body, response);

  if (isPublicLandingRequest(request, url) && isCacheablePublicHtmlResponse(cachedResponse)) {
    cachedResponse.headers.set("Cache-Control", PUBLIC_HTML_CACHE_CONTROL);
    return cachedResponse;
  }

  if (isPrivateDynamicPath(url.pathname)) {
    cachedResponse.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL);
  }

  return cachedResponse;
}

function putPublicHtmlCache(
  request: Request,
  url: URL,
  response: Response,
  context: WaitUntilContext | undefined
) {
  if (!isPublicLandingRequest(request, url) || !isCacheablePublicHtmlResponse(response)) return;

  const cache = getDefaultCache();
  if (!cache) return;

  const putPromise = cache.put(getPublicHtmlCacheKey(request), response.clone());
  context?.waitUntil?.(putPromise);
}

function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(request, ...args) {
      const url = new URL(request.url);

      if (isStaticAssetPath(url.pathname)) {
        return respondStaticNotFound();
      }

      const cachedResponse = await matchPublicHtmlCache(request, url);
      if (cachedResponse) {
        return cachedResponse;
      }

      const response = await entry.fetch(request, ...args);
      const optimizedResponse = applyWorkerCacheHeaders(request, url, response);
      putPublicHtmlCache(request, url, optimizedResponse, getWorkerContext(args));

      return optimizedResponse;
    }
  };
}

const fetch = createStartHandler(defaultStreamHandler);

export default createServerEntry({ fetch });
