import { access, mkdir, readFile } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { profileDirectory, storageStatePath } from "./config.js";

export const baseUrl = "https://control.mijnhostingpartner.nl";

async function findChrome(): Promise<string | undefined> {
  const candidates = [
    process.env.MHP_DNS_CHROME,
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env["PROGRAMFILES(X86)"] && `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((item): item is string => Boolean(item));

  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch { /* try the next location */ }
  }
  return undefined;
}

export async function openBrowser(headed: boolean): Promise<BrowserContext> {
  await mkdir(profileDirectory, { recursive: true });
  const executablePath = await findChrome();
  const context = await chromium.launchPersistentContext(profileDirectory, {
    headless: !headed,
    executablePath,
    channel: executablePath ? undefined : "chrome",
    viewport: headed ? null : { width: 1440, height: 1000 },
  });
  try {
    const state = JSON.parse(await readFile(storageStatePath, "utf8")) as { cookies?: Parameters<BrowserContext["addCookies"]>[0] };
    if (state.cookies?.length) await context.addCookies(state.cookies);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return context;
}

export async function getPage(context: BrowserContext): Promise<Page> {
  return context.pages()[0] ?? context.newPage();
}

export function looksLoggedIn(url: string): boolean {
  return new URL(url).hostname === "control.mijnhostingpartner.nl" && !url.toLowerCase().includes("login");
}

export async function assertLoggedIn(page: Page): Promise<void> {
  const response = await page.request.post(`${baseUrl}/api/Auth/CurrentUserInfo`, { data: null });
  if (!response.ok()) throw new Error("Not logged in. Run 'mhp-dns login' first.");
  const body = await response.text();
  if (!body || body === "null" || !response.headers()["content-type"]?.includes("application/json")) {
    throw new Error("The saved session has expired. Run 'mhp-dns login' again.");
  }
  const user = JSON.parse(body) as { isAuthenticated?: boolean };
  if (!user.isAuthenticated) throw new Error("The saved session has expired. Run 'mhp-dns login' again.");
}

export async function waitForLogin(page: Page, timeout = 5 * 60_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      await assertLoggedIn(page);
      return;
    } catch {
      await page.waitForTimeout(1_000);
    }
  }
  throw new Error("Timed out waiting for login.");
}
