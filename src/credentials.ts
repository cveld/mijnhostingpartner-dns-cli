import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { homeDirectory } from "./config.js";

export interface Credentials {
  username: string;
  password: string;
  source: "environment" | "env-file";
}

export type CredentialProtection = "base64" | "dpapi";

export const defaultCredentialsPath = join(homeDirectory, ".env");
const dpapiEntropy = Buffer.from("mhp-dns-cli:v1", "utf8").toString("base64");

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
  return {
    username,
    password,
    source: hadUsername && hadPassword ? "environment" : "env-file",
  };
}

export async function saveCredentials(credentials: Omit<Credentials, "source">, path = defaultCredentialsPath, overwrite = false, protection: CredentialProtection = process.platform === "win32" ? "dpapi" : "base64"): Promise<string> {
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
