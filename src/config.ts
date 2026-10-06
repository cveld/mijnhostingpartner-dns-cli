import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { DomainContext } from "./types.js";

interface ConfigFile { domains: Record<string, DomainContext> }
const home = process.env.MHP_DNS_HOME ?? join(homedir(), ".mhp-dns");
export const profileDirectory = process.env.MHP_DNS_PROFILE ?? join(home, "browser-profile");
export const configPath = process.env.MHP_DNS_CONFIG ?? join(home, "config.json");

async function load(): Promise<ConfigFile> {
  try { return JSON.parse(await readFile(configPath, "utf8")) as ConfigFile; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { domains: {} };
    throw error;
  }
}

export async function saveDomain(name: string, context: DomainContext): Promise<void> {
  const config = await load();
  config.domains[name.toLowerCase()] = { ...context, domainName: name.toLowerCase() };
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function getDomain(name: string): Promise<DomainContext> {
  const context = (await load()).domains[name.toLowerCase()];
  if (!context) throw new Error(`Domain '${name}' is not configured. Run: mhp-dns domain add ${name} --url <dns-records-url>`);
  return context;
}

export function parseDnsUrl(value: string): DomainContext {
  const url = new URL(value);
  if (url.hostname !== "control.mijnhostingpartner.nl" || !url.pathname.endsWith("/account/domains/dns-records")) {
    throw new Error("Expected a MijnHostingPartner DNS records URL.");
  }
  const numberParam = (name: string) => {
    const parsed = Number(url.searchParams.get(name));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  };
  const domainId = numberParam("id");
  if (!domainId) throw new Error("The URL has no valid domain id.");
  return { domainId, userId: numberParam("userId"), packageId: numberParam("packageId") };
}
