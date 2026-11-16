import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseUrl, MhpHttp } from "../src/http.js";
import { MhpApi } from "../src/api.js";

// Tests must never touch the real Windows Credential Manager entries.
process.env.MHP_DNS_KEYRING = "off";

const json = (value: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json", ...headers } });

async function fixture(action: (session: string, browser: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "mhp-http-test-"));
  try { await action(join(directory, "session.json"), join(directory, "browser.json")); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("native login submits only required fields and persists/reuses cookies", async () => {
  await fixture(async (session, browser) => {
    let authenticated = false;
    const paths: string[] = [];
    const fetcher: typeof fetch = async (input, options) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      assert.equal(options?.redirect, "manual");
      if (path === "/auth/login") return new Response("Login");
      if (path.endsWith("IsCaptchaRequired")) return json(false);
      if (path.endsWith("/Login")) {
        assert.deepEqual(JSON.parse(String(options?.body)), {
          Login: "test-login", Password: "test-password", IsExternal: false,
        });
        authenticated = true;
        return json({}, { "Set-Cookie": "session=test-session; Path=/; Secure; HttpOnly" });
      }
      assert.equal(new Headers(options?.headers).get("Cookie"), "session=test-session");
      return json({ isAuthenticated: authenticated });
    };
    const client = await MhpHttp.open(session, browser, fetcher);
    await client.login({ username: "test-login", password: "test-password", source: "environment" });
    const saved = await readFile(session, "utf8");
    assert.ok(!saved.includes("test-password"));
    const restored = await MhpHttp.open(session, browser, fetcher);
    await restored.ensureAuthenticated();
    assert.equal(paths.filter(path => path.endsWith("/Login")).length, 1);
  });
});

test("CAPTCHA never submits credentials or opens a browser", async () => {
  await fixture(async (session, browser) => {
    const paths: string[] = [];
    const fetcher: typeof fetch = async input => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      return path.endsWith("IsCaptchaRequired") ? json(true) : new Response("Login");
    };
    const client = await MhpHttp.open(session, browser, fetcher);
    await assert.rejects(client.login({ username: "secret-user", password: "secret-password", source: "environment" }), /--headed login/);
    assert.ok(!paths.includes("/api/Auth/Login"));
  });
});

test("imports only provider cookies from existing interactive storage state", async () => {
  await fixture(async (session, browser) => {
    await writeFile(browser, JSON.stringify({ cookies: [
      { name: "session", value: "valid", domain: "control.mijnhostingpartner.nl", path: "/", expires: -1, secure: true, httpOnly: true },
      { name: "unrelated", value: "private", domain: "example.com", path: "/", expires: -1, secure: true, httpOnly: true },
    ] }));
    const fetcher: typeof fetch = async (_, options) => {
      assert.equal(new Headers(options?.headers).get("Cookie"), "session=valid");
      return json({ isAuthenticated: true });
    };
    const client = await MhpHttp.open(session, browser, fetcher);
    assert.equal(await client.authenticated(), true);
    await client.save();
    assert.ok(!(await readFile(session, "utf8")).includes("unrelated"));
  });
});

test("HTTP errors are redacted, redirects are not followed, off-origin calls rejected", async () => {
  await fixture(async (session, browser) => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      return new Response("secret-password session-cookie", { status: 302,
        headers: { Location: "https://example.com/" } });
    };
    const client = await MhpHttp.open(session, browser, fetcher);
    await assert.rejects(client.post(`${baseUrl}/api/test`, { data: null }), error =>
      error instanceof Error && /HTTP 302/.test(error.message) && !/secret|cookie/.test(error.message));
    await assert.rejects(client.post("https://example.com/api/test", { data: null }), /off-origin/);
    assert.equal(calls, 1);
  });
});

test("DNS mutation payloads remain compatible and are never automatically retried", async () => {
  await fixture(async (session, browser) => {
    const bodies: { path: string; data: unknown }[] = [];
    const fetcher: typeof fetch = async (input, options) => {
      bodies.push({ path: new URL(String(input)).pathname, data: JSON.parse(String(options?.body)) });
      return json({});
    };
    const api = new MhpApi(await MhpHttp.open(session, browser, fetcher));
    await api.addRecord(123, { name: "test", type: "TXT", data: "verification", ttl: 0 });
    const original = { recordName: "test", recordType: "TXT", recordData: "verification" } as Parameters<MhpApi["deleteRecord"]>[1];
    await api.updateRecord(123, original, { name: "test", type: "TXT", data: "next", ttl: 0 });
    await api.deleteRecord(123, original);
    assert.equal(bodies.length, 3);
    assert.equal(bodies[0].path, "/api/Account/DomainDns/AddDnsZoneRecord");
    assert.deepEqual(bodies[2].data, { domainId: 123, recordName: "test", recordType: "TXT", recordData: "verification" });
  });
});

test("a failed DNS mutation is not replayed", async () => {
  await fixture(async (session, browser) => {
    let calls = 0;
    const fetcher: typeof fetch = async () => {
      calls++;
      return new Response("private provider diagnostic", { status: 500 });
    };
    const api = new MhpApi(await MhpHttp.open(session, browser, fetcher));
    await assert.rejects(api.addRecord(123, { name: "test", type: "TXT", data: "value", ttl: 0 }), /HTTP 500/);
    assert.equal(calls, 1);
  });
});

test("expired sessions refresh before the next operation using environment credentials", async () => {
  await fixture(async (session, browser) => {
    const prior = { username: process.env.MHP_DNS_USERNAME, password: process.env.MHP_DNS_PASSWORD };
    process.env.MHP_DNS_USERNAME = "test-login";
    process.env.MHP_DNS_PASSWORD = "test-password";
    try {
      let authenticated = false;
      const paths: string[] = [];
      const fetcher: typeof fetch = async input => {
        const path = new URL(String(input)).pathname;
        paths.push(path);
        if (path === "/auth/login") return new Response("Login");
        if (path.endsWith("IsCaptchaRequired")) return json(false);
        if (path.endsWith("/Login")) {
          authenticated = true;
          return json({});
        }
        return json({ isAuthenticated: authenticated });
      };
      const client = await MhpHttp.open(session, browser, fetcher);
      await client.ensureAuthenticated();
      assert.deepEqual(paths, [
        "/api/Auth/CurrentUserInfo", "/auth/login", "/api/Auth/IsCaptchaRequired",
        "/api/Auth/Login", "/api/Auth/CurrentUserInfo",
      ]);
    } finally {
      if (prior.username === undefined) delete process.env.MHP_DNS_USERNAME;
      else process.env.MHP_DNS_USERNAME = prior.username;
      if (prior.password === undefined) delete process.env.MHP_DNS_PASSWORD;
      else process.env.MHP_DNS_PASSWORD = prior.password;
    }
  });
});
