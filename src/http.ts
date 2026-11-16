import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { CookieJar } from "tough-cookie";
import { homeDirectory, storageStatePath } from "./config.js";
import { loadCredentials, type Credentials } from "./credentials.js";

export const baseUrl = "https://control.mijnhostingpartner.nl";
export const httpSessionPath = `${homeDirectory}/http-session.json`;

export interface HttpResponse {
  ok(): boolean;
  status(): number;
  text(): Promise<string>;
}

export interface ApiTransport {
  post(url: string, options: { data: unknown }): Promise<HttpResponse>;
}

/** Native HTTP transport. Chrome is used only when explicitly requested. */
export class MhpHttp implements ApiTransport {
  private constructor(
    private readonly jar: CookieJar,
    private readonly sessionPath: string,
    private readonly fetcher: typeof fetch,
  ) {}

  static async open(
    sessionPath = httpSessionPath,
    browserStatePath = storageStatePath,
    fetcher: typeof fetch = fetch,
  ): Promise<MhpHttp> {
    let jar = new CookieJar();
    try {
      jar = CookieJar.deserializeSync(JSON.parse(await readFile(sessionPath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error("Unable to read the saved HTTP session. Remove it and log in again.");
      }
      // Reuse an existing interactive login without starting Playwright.
      try {
        const state = JSON.parse(await readFile(browserStatePath, "utf8")) as {
          cookies?: { name: string; value: string; domain: string; path: string;
            expires: number; secure: boolean; httpOnly: boolean }[];
        };
        for (const cookie of state.cookies ?? []) {
          if (cookie.domain.replace(/^\./, "") !== new URL(baseUrl).hostname) continue;
          const attributes = [
            `${cookie.name}=${cookie.value}`, `Domain=${cookie.domain}`, `Path=${cookie.path}`,
            cookie.secure ? "Secure" : "", cookie.httpOnly ? "HttpOnly" : "",
            cookie.expires > 0 ? `Expires=${new Date(cookie.expires * 1000).toUTCString()}` : "",
          ].filter(Boolean).join("; ");
          await jar.setCookie(attributes, baseUrl);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new Error("Unable to import the saved browser session.");
        }
      }
    }
    return new MhpHttp(jar, sessionPath, fetcher);
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.sessionPath), { recursive: true, mode: 0o700 });
    const temporary = `${this.sessionPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(this.jar.serializeSync()), { mode: 0o600 });
    await rename(temporary, this.sessionPath);
    await chmod(this.sessionPath, 0o600);
  }

  private async request(url: string, data?: unknown): Promise<HttpResponse> {
    const target = new URL(url);
    if (target.origin !== baseUrl) throw new Error("Refusing an off-origin provider request.");
    const cookie = await this.jar.getCookieString(target.href);
    let response: Response;
    try {
      response = await this.fetcher(target.href, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json", Origin: baseUrl,
          Referer: `${baseUrl}/auth/login`, "User-Agent": "MhpDnsCli/1.0",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
        redirect: "manual", signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new Error(`Provider HTTPS request failed for ${target.pathname}.`);
    }
    try {
      for (const value of response.headers.getSetCookie()) {
        await this.jar.setCookie(value, target.href);
      }
    } catch {
      throw new Error(`Invalid provider cookie for ${target.pathname}.`);
    }
    // Never follow redirects with credentials or expose response bodies in errors.
    if (!response.ok) {
      throw new Error(`Provider API returned HTTP ${response.status} for ${target.pathname}.`);
    }
    let text: string;
    try { text = await response.text(); }
    catch { throw new Error(`Unable to read the provider response for ${target.pathname}.`); }
    if (target.pathname.startsWith("/api/")
        && !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error(`Unexpected provider response for ${target.pathname}.`);
    }
    return { ok: () => true, status: () => response.status, text: async () => text };
  }

  post(url: string, options: { data: unknown }): Promise<HttpResponse> {
    return this.request(url, options.data);
  }

  private async json(path: string, data: unknown = null): Promise<unknown> {
    const response = await this.post(`${baseUrl}${path}`, { data });
    try { return JSON.parse(await response.text()); }
    catch { throw new Error(`Invalid provider JSON for ${path}.`); }
  }

  async authenticated(): Promise<boolean> {
    const user = await this.json("/api/Auth/CurrentUserInfo") as { isAuthenticated?: boolean } | null;
    return user?.isAuthenticated === true;
  }

  async login(credentials: Credentials): Promise<void> {
    await this.request(`${baseUrl}/auth/login`);
    const captcha = await this.json("/api/Auth/IsCaptchaRequired");
    if (captcha !== false) {
      throw new Error("Provider requires interactive verification. Run 'mhp-dns --headed login'.");
    }
    await this.json("/api/Auth/Login", {
      Login: credentials.username, Password: credentials.password, IsExternal: false,
    });
    if (!await this.authenticated()) {
      throw new Error("HTTP login did not complete. Check credentials or run 'mhp-dns --headed login' for MFA/CAPTCHA.");
    }
    await this.save();
  }

  async ensureAuthenticated(): Promise<void> {
    let authenticated = false;
    try { authenticated = await this.authenticated(); } catch { /* try a fresh login */ }
    if (authenticated) return;
    const credentials = loadCredentials();
    if (!credentials) {
      throw new Error("The saved session has expired. Run 'mhp-dns login' with credentials or 'mhp-dns --headed login'.");
    }
    await this.login(credentials);
  }
}
