import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

async function findBuiltAsset(predicate) {
  const filenames = await readdir("dist/client/assets");
  const filename = filenames.find(predicate);

  if (!filename) {
    throw new Error("Expected built asset was not found in dist/client/assets");
  }

  return `/assets/${filename}`;
}

function parseHeadersFile(body) {
  const rules = new Map();
  let currentRule = null;

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (!/^\s/.test(line)) {
      currentRule = trimmed;
      rules.set(currentRule, new Map());
      continue;
    }

    if (!currentRule) {
      throw new Error(`Header without a rule: ${line}`);
    }

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 0) {
      throw new Error(`Invalid header line: ${line}`);
    }

    const name = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1).trim();
    rules.get(currentRule).set(name, value);
  }

  return rules;
}

function assertCacheRule(rules, path, expected) {
  assert.equal(rules.get(path)?.get("Cache-Control"), expected);
}

function matchesHeadersPath(rulePath, requestPath) {
  if (!rulePath.includes("*")) return rulePath === requestPath;
  const pattern = rulePath
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${pattern}$`).test(requestPath);
}

function countMatchingCacheRules(rules, requestPath) {
  let count = 0;

  for (const [rulePath, headers] of rules) {
    if (headers.has("Cache-Control") && matchesHeadersPath(rulePath, requestPath)) {
      count += 1;
    }
  }

  return count;
}

async function getFreePort() {
  const server = createServer();

  return await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Unable to allocate a local test port"));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function startServer(port) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start:\n${output}`));
    }, 10_000);

    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes("Server running")) {
        clearTimeout(timeout);
        resolve();
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before ready with ${code}:\n${output}`));
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return child;
}

test("Cloudflare static headers cache heavy public asset groups", async () => {
  const rules = parseHeadersFile(await readFile("public/_headers", "utf8"));

  assertCacheRule(rules, "/assets/*", "public, max-age=31536000, immutable");
  assertCacheRule(rules, "/fonts/*", "public, max-age=31536000, immutable");
  assertCacheRule(
    rules,
    "/template-snapshots/*",
    "public, max-age=86400, stale-while-revalidate=604800"
  );
  assertCacheRule(
    rules,
    "/features/*",
    "public, max-age=604800, stale-while-revalidate=2592000"
  );
  assertCacheRule(rules, "/avatar.png", "public, max-age=86400, stale-while-revalidate=604800");
  assertCacheRule(rules, "/icon.png", "public, max-age=86400, stale-while-revalidate=604800");
  assertCacheRule(rules, "/web-shot.png", "public, max-age=86400, stale-while-revalidate=604800");
  assertCacheRule(rules, "/logo.svg", "public, max-age=86400, stale-while-revalidate=604800");
  assertCacheRule(rules, "/favicon.ico", "public, max-age=86400, stale-while-revalidate=604800");
  assertCacheRule(rules, "/robots.txt", "public, max-age=3600, must-revalidate");
  assertCacheRule(rules, "/sitemap.xml", "public, max-age=3600, must-revalidate");

  for (const path of [
    "/assets/main-example.js",
    "/fonts/MiSans-Normal.ttf",
    "/template-snapshots/zh/classic.png",
    "/features/grammar.png",
    "/logo.svg",
    "/sitemap.xml"
  ]) {
    assert.equal(countMatchingCacheRules(rules, path), 1);
  }
});

test("missing built assets return 404 instead of SSR HTML", async () => {
  const port = await getFreePort();
  const server = await startServer(port);

  try {
    const paths = [
      "/assets/__missing-refresh-regression__.css",
      "/assets/__missing-refresh-regression__.js",
      "/fonts/__missing-refresh-regression__.woff2"
    ];

    for (const pathname of paths) {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        headers: {
          accept: "*/*"
        }
      });
      const body = await response.text();

      assert.equal(response.status, 404);
      assert.notEqual(response.headers.get("content-type"), "text/html; charset=utf-8");
      assert.equal(body.includes("<!DOCTYPE html>"), false);
    }
  } finally {
    server.kill();
  }
});

test("node server applies cache headers to heavy public asset groups", async () => {
  const port = await getFreePort();
  const server = await startServer(port);

  try {
    const cssPath = await findBuiltAsset(
      (filename) => filename.startsWith("globals-") && filename.endsWith(".css")
    );
    const cases = [
      [cssPath, "public, max-age=31536000, immutable"],
      ["/fonts/MiSans-Normal.ttf", "public, max-age=31536000, immutable"],
      [
        "/template-snapshots/zh/classic.png",
        "public, max-age=86400, stale-while-revalidate=604800"
      ],
      ["/features/grammar.png", "public, max-age=604800, stale-while-revalidate=2592000"],
      ["/logo.svg", "public, max-age=86400, stale-while-revalidate=604800"],
      ["/sitemap.xml", "public, max-age=3600, must-revalidate"]
    ];

    for (const [pathname, expectedCacheControl] of cases) {
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
        method: "HEAD"
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), expectedCacheControl);
    }
  } finally {
    server.kill();
  }
});

test("built assets and SSR pages return distinct content types", async () => {
  const port = await getFreePort();
  const server = await startServer(port);

  try {
    const cssPath = await findBuiltAsset(
      (filename) => filename.startsWith("globals-") && filename.endsWith(".css")
    );
    const modulePath = await findBuiltAsset((filename) => filename.endsWith(".mjs"));

    const cssResponse = await fetch(`http://127.0.0.1:${port}${cssPath}`);
    const cssBody = await cssResponse.text();

    assert.equal(cssResponse.status, 200);
    assert.equal(cssResponse.headers.get("content-type"), "text/css; charset=utf-8");
    assert.equal(cssBody.includes("<!DOCTYPE html>"), false);

    const moduleResponse = await fetch(`http://127.0.0.1:${port}${modulePath}`);

    assert.equal(moduleResponse.status, 200);
    assert.equal(
      moduleResponse.headers.get("content-type"),
      "text/javascript; charset=utf-8"
    );

    const pageResponse = await fetch(`http://127.0.0.1:${port}/zh`);
    const pageBody = await pageResponse.text();

    assert.equal(pageResponse.status, 200);
    assert.equal(pageResponse.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(pageBody.includes("<!DOCTYPE html>"), true);
  } finally {
    server.kill();
  }
});

test("built global stylesheet does not block on remote imports", async () => {
  const cssPath = await findBuiltAsset(
    (filename) => filename.startsWith("globals-") && filename.endsWith(".css")
  );
  const cssBody = await readFile(`dist/client${cssPath}`, "utf8");

  assert.equal(cssBody.includes("@import"), false);
  assert.equal(cssBody.includes("fonts.googleapis.com"), false);
});

test("server entry returns plain 404 for missing static assets", async () => {
  const serverEntry = await import("../dist/server/server.js");
  const paths = [
    "/assets/__missing-refresh-regression__.css",
    "/assets/__missing-refresh-regression__.js",
    "/fonts/__missing-refresh-regression__.woff2"
  ];

  for (const pathname of paths) {
    const response = await serverEntry.default.fetch(
      new Request(`http://local.test${pathname}`, {
        headers: {
          accept: "*/*"
        }
      })
    );
    const body = await response.text();

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(body.includes("<!DOCTYPE html>"), false);
  }
});
