import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { homeDirectory } from "./config.js";

export interface Credentials {
  username: string;
  password: string;
  source: "environment" | "env-file" | "credential-manager";
}

export type CredentialProtection = "base64" | "dpapi" | "credential-manager";

export const defaultCredentialsPath = join(homeDirectory, ".env");
const dpapiEntropy = Buffer.from("mhp-dns-cli:v1", "utf8").toString("base64");

const keyringService = () => process.env.MHP_DNS_KEYRING_SERVICE ?? "mhp-dns-cli";
export const credentialManagerLabel = "Windows Credential Manager";

interface KeyringEntry { getPassword(): string | null; setPassword(password: string): void }

/**
 * Windows Credential Manager through the native keyring binding, loaded lazily so a missing binary only
 * disables this source. Windows only; set MHP_DNS_KEYRING=off to skip it (for example in tests).
 * Unlike the PowerShell DPAPI call below it runs in-process, so no powershell.exe child is spawned.
 */
function keyringEntry(account: "username" | "password"): KeyringEntry | undefined {
  if (process.platform !== "win32" || process.env.MHP_DNS_KEYRING === "off") return undefined;
  try {
    const { Entry } = createRequire(import.meta.url)("@napi-rs/keyring") as { Entry: new (service: string, account: string) => KeyringEntry };
    return new Entry(keyringService(), account);
  } catch { return undefined; }
}

function readKeyring(): { username: string; password: string } | undefined {
  try {
    const username = keyringEntry("username")?.getPassword();
    const password = keyringEntry("password")?.getPassword();
    return username && password ? { username, password } : undefined;
  } catch { return undefined; }
}

function writeKeyring(credentials: { username: string; password: string }): boolean {
  try {
    const username = keyringEntry("username");
    const password = keyringEntry("password");
    if (!username || !password) return false;
    username.setPassword(credentials.username);
    password.setPassword(credentials.password);
    return true;
  } catch { return false; }
}

function dpapi(operation: "Protect" | "Unprotect", value: string): string {
  if (process.platform !== "win32") throw new Error("DPAPI credential protection is only available on Windows.");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "[Reflection.Assembly]::LoadWithPartialName('System.Security') | Out-Null",
    "$inputBytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())",
    `$entropy = [Convert]::FromBase64String('${dpapiEntropy}')`,
    `$outputBytes = [Security.Cryptography.ProtectedData]::${operation}($inputBytes, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    "[Console]::Out.Write([Convert]::ToBase64String($outputBytes))",
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: operation === "Protect" ? Buffer.from(value, "utf8").toString("base64") : value,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw new Error(`DPAPI ${operation.toLowerCase()} failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`DPAPI ${operation.toLowerCase()} failed: ${result.stderr.trim() || `exit code ${result.status}`}`);
  const output = result.stdout.trim();
  return operation === "Protect" ? output : Buffer.from(output, "base64").toString("utf8");
}

export function findCredentialsFile(explicitPath?: string): string | undefined {
  const configuredPath = explicitPath ?? process.env.MHP_DNS_ENV_FILE;
  if (configuredPath) {
    const path = resolve(configuredPath);
    if (!existsSync(path)) throw new Error(`Environment file '${path}' does not exist.`);
    return path;
  }
  const localPath = resolve(".env");
  if (existsSync(localPath)) return localPath;
  if (existsSync(defaultCredentialsPath)) return defaultCredentialsPath;
  return undefined;
}

export function assertCredentialsFileWritable(path = defaultCredentialsPath, overwrite = false): string {
  const resolvedPath = resolve(path);
  if (!overwrite && existsSync(resolvedPath)) {
    throw new Error(`Credentials file '${resolvedPath}' already exists. Pass --force to replace it.`);
  }
  return resolvedPath;
}

export function loadCredentials(envFile?: string): Credentials | undefined {
  const hadUsername = Boolean(process.env.MHP_DNS_USERNAME);
  const hadPassword = Boolean(process.env.MHP_DNS_PASSWORD);
  const explicit = Boolean(envFile ?? process.env.MHP_DNS_ENV_FILE);
  // Without an explicit file or complete environment values, Credential Manager is the primary store.
  if (!explicit && !(hadUsername && hadPassword)) {
    const stored = readKeyring();
    if (stored) return { ...stored, source: "credential-manager" };
  }
  const path = findCredentialsFile(envFile);
  if (path) loadEnvFile(path);

  const decode = (value?: string) => value ? Buffer.from(value, "base64").toString("utf8") : undefined;
  const username = process.env.MHP_DNS_USERNAME
    ?? (process.env.MHP_DNS_USERNAME_DPAPI ? dpapi("Unprotect", process.env.MHP_DNS_USERNAME_DPAPI) : undefined)
    ?? decode(process.env.MHP_DNS_USERNAME_BASE64);
  const password = process.env.MHP_DNS_PASSWORD
    ?? (process.env.MHP_DNS_PASSWORD_DPAPI ? dpapi("Unprotect", process.env.MHP_DNS_PASSWORD_DPAPI) : undefined)
    ?? decode(process.env.MHP_DNS_PASSWORD_BASE64);
  if (!username && !password) return undefined;
  if (!username || !password) {
    throw new Error("Both MHP_DNS_USERNAME and MHP_DNS_PASSWORD must be configured.");
  }
  // Legacy DPAPI blobs in the default file are decrypted through PowerShell once, then moved to Credential Manager.
  // Only when both values really came from those blobs, never from plain environment values.
  const fromDpapi = !process.env.MHP_DNS_USERNAME && !process.env.MHP_DNS_PASSWORD
    && process.env.MHP_DNS_USERNAME_DPAPI && process.env.MHP_DNS_PASSWORD_DPAPI;
  if (!explicit && path === defaultCredentialsPath && fromDpapi) writeKeyring({ username, password });
  return {
    username,
    password,
    source: hadUsername && hadPassword ? "environment" : "env-file",
  };
}

export function assertCredentialManagerWritable(overwrite = false): void {
  if (process.platform !== "win32") throw new Error("Windows Credential Manager is only available on Windows.");
  if (!overwrite && readKeyring()) throw new Error(`${credentialManagerLabel} already holds credentials for ${keyringService()}. Pass --force to replace them.`);
}

export async function saveCredentials(credentials: Omit<Credentials, "source">, path = defaultCredentialsPath, overwrite = false, protection: CredentialProtection = process.platform === "win32" ? "credential-manager" : "base64"): Promise<string> {
  if (protection === "credential-manager") {
    assertCredentialManagerWritable(overwrite);
    if (!writeKeyring(credentials)) throw new Error(`${credentialManagerLabel} could not be written.`);
    return credentialManagerLabel;
  }
  const resolvedPath = assertCredentialsFileWritable(path, overwrite);
  await mkdir(dirname(resolvedPath), { recursive: true });
  const encode = (value: string) => protection === "dpapi" ? dpapi("Protect", value) : Buffer.from(value, "utf8").toString("base64");
  const suffix = protection === "dpapi" ? "DPAPI" : "BASE64";
  const content = [
    `MHP_DNS_USERNAME_${suffix}=${encode(credentials.username)}`,
    `MHP_DNS_PASSWORD_${suffix}=${encode(credentials.password)}`,
    "",
  ].join("\n");
  await writeFile(resolvedPath, content, { encoding: "utf8", mode: 0o600 });
  return resolvedPath;
}
