import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertCredentialsFileWritable, findCredentialsFile, loadCredentials, saveCredentials } from "../src/credentials.js";

const keys = ["MHP_DNS_USERNAME", "MHP_DNS_PASSWORD", "MHP_DNS_USERNAME_BASE64", "MHP_DNS_PASSWORD_BASE64", "MHP_DNS_USERNAME_DPAPI", "MHP_DNS_PASSWORD_DPAPI", "MHP_DNS_ENV_FILE"] as const;

async function isolated(run: (directory: string) => Promise<void>): Promise<void> {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const directory = await mkdtemp(join(tmpdir(), "mhp-dns-credentials-"));
  try {
    for (const key of keys) delete process.env[key];
    await run(directory);
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

test("loads credentials from an explicit env file", async () => isolated(async directory => {
  const path = join(directory, "credentials.env");
  await writeFile(path, "MHP_DNS_USERNAME=test-user\nMHP_DNS_PASSWORD=test-password\n");
  assert.deepEqual(loadCredentials(path), {
    username: "test-user", password: "test-password", source: "env-file",
  });
}));

test("rejects an explicit env file that does not exist", async () => isolated(async directory => {
  assert.throws(() => loadCredentials(join(directory, "missing.env")), /does not exist/);
}));

test("requires both credential values", async () => isolated(async directory => {
  const path = join(directory, "credentials.env");
  await writeFile(path, "MHP_DNS_USERNAME=test-user\n");
  assert.throws(() => loadCredentials(path), /Both MHP_DNS_USERNAME and MHP_DNS_PASSWORD/);
}));

test("uses existing environment values in preference to a file", async () => isolated(async directory => {
  const path = join(directory, "credentials.env");
  await writeFile(path, "MHP_DNS_USERNAME=file-user\nMHP_DNS_PASSWORD=file-password\n");
  process.env.MHP_DNS_USERNAME = "environment-user";
  process.env.MHP_DNS_PASSWORD = "environment-password";
  assert.deepEqual(loadCredentials(path), {
    username: "environment-user", password: "environment-password", source: "environment",
  });
}));

test("falls back to a local env file before the user-profile file", async () => isolated(async directory => {
  const previousDirectory = process.cwd();
  try {
    process.chdir(directory);
    const path = join(directory, ".env");
    await writeFile(path, "MHP_DNS_USERNAME=local-user\nMHP_DNS_PASSWORD=local-password\n");
    assert.equal(findCredentialsFile(), path);
  } finally { process.chdir(previousDirectory); }
}));

test("scaffolds an escaped credential file and refuses accidental overwrite", async () => isolated(async directory => {
  const path = join(directory, "credentials.env");
  await saveCredentials({ username: "test user", password: "quote\" and # hash" }, path, false, "base64");
  assert.deepEqual(loadCredentials(path), {
    username: "test user", password: "quote\" and # hash", source: "env-file",
  });
  await assert.rejects(saveCredentials({ username: "other", password: "secret" }, path), /already exists/);
  assert.throws(() => assertCredentialsFileWritable(path), /already exists/);
  assert.equal(assertCredentialsFileWritable(path, true), path);
}));

test("protects scaffolded credentials with the current Windows user DPAPI key", { skip: process.platform !== "win32" }, async () => isolated(async directory => {
  const path = join(directory, "credentials.env");
  await saveCredentials({ username: "dpapi-user", password: "dpapi-secret" }, path, false, "dpapi");
  const content = await import("node:fs/promises").then(fs => fs.readFile(path, "utf8"));
  assert.match(content, /MHP_DNS_USERNAME_DPAPI=/);
  assert.doesNotMatch(content, /dpapi-user|dpapi-secret/);
  assert.deepEqual(loadCredentials(path), {
    username: "dpapi-user", password: "dpapi-secret", source: "env-file",
  });
}));
