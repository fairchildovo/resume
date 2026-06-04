import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
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
