// The CommonJS build: compile it the way `npm run build` does, into a temp
// folder, and load it with require().
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
const alias = JSON.parse(readFileSync(join(pkgDir, "alias", "package.json"), "utf8"));

describe("CommonJS build", () => {
  let out: string;

  beforeAll(() => {
    // Inside the package, so require() finds node_modules (the Nest entry needs @nestjs/common).
    out = mkdtempSync(join(pkgDir, ".cjs-test-"));
    execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.cjs.json", "--outDir", out], {
      cwd: pkgDir,
      stdio: "pipe",
    });
    writeFileSync(join(out, "package.json"), JSON.stringify({ type: "commonjs" }));
  }, 60_000);

  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it("emits CommonJS with declarations", () => {
    for (const file of ["index.js", "index.d.ts", "nest.js", "nest.d.ts", "types.js"]) {
      expect(existsSync(join(out, file))).toBe(true);
    }
    const source = readFileSync(join(out, "index.js"), "utf8");
    expect(source).toContain("exports.PostShiba");
    expect(source).not.toMatch(/^export /m);
  });

  it("loads with require() and exposes the same API as the ESM build", async () => {
    const cjs = require(join(out, "index.js"));
    const esm = await import("../src/index.js");
    expect(Object.keys(cjs).sort()).toEqual(Object.keys(esm).sort());
    expect(typeof cjs.PostShiba).toBe("function");
    expect(typeof cjs.isRetryable).toBe("function");
  });

  it("makes requests and throws its own error class", async () => {
    const { PostShiba, PostShibaError } = require(join(out, "index.js"));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_api_key" }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = await new PostShiba("sk_test").users.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PostShibaError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("invalid_api_key");
  });

  it("loads the Nest entry with require()", () => {
    const nest = require(join(out, "nest.js"));
    expect(typeof nest.PostShibaModule).toBe("function");
    expect(typeof nest.sendMail).toBe("function");
    expect(nest.POSTSHIBA).toBe("POSTSHIBA");
  });

  it("points require at the CommonJS build in package.json", () => {
    expect(pkg.main).toBe("./dist/cjs/index.js");
    expect(pkg.exports["."]).toEqual({ import: "./dist/index.js", require: "./dist/cjs/index.js", default: "./dist/index.js" });
    expect(pkg.exports["./nest"]).toEqual({ import: "./dist/nest.js", require: "./dist/cjs/nest.js", default: "./dist/nest.js" });
    expect(pkg.scripts.build).toContain("tsc -p tsconfig.cjs.json");
    expect(pkg.scripts.build).toContain("dist/cjs/package.json");
  });

  it("gives the postshiba alias a require entry too", () => {
    expect(alias.exports["."].require).toBe("./index.cjs");
    expect(alias.exports["./nest"].require).toBe("./nest.cjs");
    for (const file of ["index.cjs", "index.d.cts", "nest.cjs", "nest.d.cts"]) {
      expect(alias.files).toContain(file);
      expect(existsSync(join(pkgDir, "alias", file))).toBe(true);
    }
    expect(readFileSync(join(pkgDir, "alias", "index.cjs"), "utf8")).toContain('require("@postshiba/node")');
    expect(readFileSync(join(pkgDir, "alias", "nest.cjs"), "utf8")).toContain('require("@postshiba/node/nest")');
  });
});
