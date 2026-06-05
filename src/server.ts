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

type ServerEntry = { fetch: RequestHandler<Register> };

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

function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(request, ...args) {
      const url = new URL(request.url);

      if (isStaticAssetPath(url.pathname)) {
        return respondStaticNotFound();
      }

      return await entry.fetch(request, ...args);
    }
  };
}

const fetch = createStartHandler(defaultStreamHandler);

export default createServerEntry({ fetch });
