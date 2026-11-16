# MijnHostingPartner DNS CLI

A command-line tool for managing DNS records at [MijnHostingPartner.nl](https://www.mijnhostingpartner.nl/).

The CLI uses native Node.js HTTP requests and a persisted cookie jar for login and DNS commands. Normal operation does not start Chrome or load Playwright. Credentials live in Windows Credential Manager (no child process involved); existing DPAPI-protected files are still read and moved there on first use.

Playwright is loaded only when you explicitly pass `--headed`, for interactive MFA/CAPTCHA login or first-time hosting-package discovery.

> [!WARNING]
> This project uses an undocumented control-panel API. MijnHostingPartner may change its endpoints or payloads without notice.

## Requirements

- Node.js 22 or newer
- Google Chrome only for the optional `--headed` interactive flow
- A MijnHostingPartner account with access to the domain

## Run with npx

No global installation is required:

```powershell
npx mijnhostingpartner-dns-cli login
npx mijnhostingpartner-dns-cli list example.nl
```

The shorter executable name is also available through `npm exec`:

```powershell
npm exec --package mijnhostingpartner-dns-cli -- mhp-dns --help
```

Alternatively, install the CLI globally:

```powershell
npm install --global mijnhostingpartner-dns-cli
mhp-dns --help
```

## Install the agent skill

Install the bundled skill with the [Skills CLI](https://skills.sh/):

```powershell
npx skills add cveld/mijnhostingpartner-dns-cli --skill mijnhostingpartner-dns
```

Add `-g` to make it available to supported agents across all projects:

```powershell
npx skills add cveld/mijnhostingpartner-dns-cli --skill mijnhostingpartner-dns -g
```

## Sign in once

```powershell
npx mijnhostingpartner-dns-cli login
```

The CLI signs in directly over HTTPS using configured credentials and verifies the session through `CurrentUserInfo`. Cookies are saved outside the repository in `~/.mhp-dns/http-session.json`. This file contains authentication material: protect it like a password and never commit or share it.

An existing `storage-state.json` from an interactive browser login is imported automatically when no HTTP session exists. Subsequent commands reuse the HTTP cookies; an expired session is refreshed with configured credentials before the command runs. DNS mutations are never automatically replayed after a transport error.

Optionally, put the credentials in a `.env` file. Copy `.env.example` to `.env`, fill in both values, and keep the file out of source control:

```dotenv
MHP_DNS_USERNAME=your-login
MHP_DNS_PASSWORD=your-password
```

Then run `login` normally. The CLI reads `.env` from the current directory and submits the credentials directly over HTTPS:

```powershell
npx mijnhostingpartner-dns-cli login
```

`login` requires configured credentials for its default browser-free flow. If no credentials are configured, it exits with instructions instead of opening a browser.

Use the global option before the command to explicitly start the visible, fully interactive login flow (saved credentials are not submitted in this mode):

```powershell
npx mijnhostingpartner-dns-cli --headed login
```

Interactive MFA/CAPTCHA therefore requires `--headed`. The HTTP flow never bypasses these checks or opens a browser silently. After a successful interactive login, the HTTP cookie jar is refreshed for later browser-free commands.

An unsuccessful HTTP login reports a generic credential/MFA error without printing the provider response or secrets. Credentials can be replaced with:

```powershell
npx mijnhostingpartner-dns-cli credentials init --force
```

The lookup order is: complete `MHP_DNS_USERNAME`/`MHP_DNS_PASSWORD` environment variables, then (unless `--env-file` or `MHP_DNS_ENV_FILE` is given) Windows Credential Manager, then `.env` in the current directory, then `~/.mhp-dns/.env`. Set `MHP_DNS_KEYRING=off` to skip Credential Manager.

The CLI can securely scaffold the user-profile file. The password is not echoed:

```powershell
npx mijnhostingpartner-dns-cli credentials init
```

On Windows, `credentials init` stores the login in Windows Credential Manager by default (service `mhp-dns-cli`, accounts `username` and `password`), so nothing is written to a file. Credential Manager is per Windows user; another user account or computer cannot read it. A legacy `~/.mhp-dns/.env` with `*_DPAPI` values keeps working: it is decrypted through PowerShell once and then copied to Credential Manager, after which that PowerShell call no longer runs. Decrypting DPAPI through PowerShell is what endpoint protection such as Defender flags as suspicious DPAPI activity. On other platforms, the fallback is Base64 encoding. Select explicitly with `--protection credential-manager`, `--protection dpapi` or `--protection base64`. Base64 is not encryption; protect such a file like a password. Use `--force` to replace an existing file. To use a file elsewhere, pass `--env-file` or set `MHP_DNS_ENV_FILE`:

```powershell
npx mijnhostingpartner-dns-cli login --env-file C:\secure\mhp.env
```

Already-set `MHP_DNS_USERNAME` and `MHP_DNS_PASSWORD` environment variables take precedence over values in the file. Do not commit a credential-bearing `.env` file.

## Register a domain

After signing in, let the CLI find and save the identifiers for a domain from the control panel:

```powershell
npx mijnhostingpartner-dns-cli domain discover example.nl
```

This uses hosting-package identifiers already saved in the configuration. If no package has been configured, provide `--package-id`, use `domain add --url`, or explicitly allow one browser-based discovery:

```powershell
npx mijnhostingpartner-dns-cli --headed domain discover example.nl
```

After that initial discovery, normal DNS operations and discovery within configured packages are browser-free.

As a fallback, copy the URL of the domain's DNS records page from the control panel:

```powershell
npx mijnhostingpartner-dns-cli domain add example.nl --url "https://control.mijnhostingpartner.nl/account/domains/dns-records?userId=123&packageId=456&id=789"
```

Only the domain identifiers are saved. Credentials and DNS records are not written to the configuration file.

If you only know the hosting package ID, list or save its domains directly:

```powershell
npx mijnhostingpartner-dns-cli domain discover --package-id 456
npx mijnhostingpartner-dns-cli domain discover example.nl --package-id 456
```

## Usage

```powershell
npx mijnhostingpartner-dns-cli list example.nl
npx mijnhostingpartner-dns-cli list example.nl --type TXT --json
npx mijnhostingpartner-dns-cli add example.nl api --type A --data 192.0.2.10 --ttl 3600
npx mijnhostingpartner-dns-cli update example.nl api --match-type A --data 192.0.2.20
npx mijnhostingpartner-dns-cli delete example.nl api --type A --data 192.0.2.20
```

Use `@` for the zone apex. Mutating commands ask for confirmation; pass `--yes` to skip it.

Use the global `--headed` option to keep Chrome visible while debugging:

```powershell
npx mijnhostingpartner-dns-cli --headed list example.nl
```

## Configuration

| Environment variable | Purpose |
| --- | --- |
| `MHP_DNS_HOME` | Location of configuration, HTTP session and optional browser profile |
| `MHP_DNS_PROFILE` | Override the browser profile directory |
| `MHP_DNS_CONFIG` | Override the configuration file path |
| `MHP_DNS_CHROME` | Explicit path to the Chrome executable |
| `MHP_DNS_ENV_FILE` | Optional path to a credential `.env` file |
| `MHP_DNS_USERNAME` | Optional control-panel login name |
| `MHP_DNS_PASSWORD` | Optional control-panel password |
| `MHP_DNS_USERNAME_BASE64` | Base64 login name written by `credentials init` |
| `MHP_DNS_PASSWORD_BASE64` | Base64 password written by `credentials init` |
| `MHP_DNS_USERNAME_DPAPI` | Windows DPAPI-protected login name |
| `MHP_DNS_PASSWORD_DPAPI` | Windows DPAPI-protected password |

## Local development

```powershell
npm install
npm run check
npm test
npm run build
npm link
```

## Internal endpoints

The following control-panel endpoints were discovered:

- `POST /api/Auth/CurrentUserInfo`
- `POST /api/Auth/IsCaptchaRequired`
- `POST /api/Auth/Login` with `Login`, `Password`, and `IsExternal: false`
- `POST /api/Account/DomainDns/GetDnsZoneRecords`
- `POST /api/Account/DomainDns/AddDnsZoneRecord`
- `POST /api/Account/DomainDns/UpdateDnsZoneRecord`
- `POST /api/Account/DomainDns/DeleteDnsZoneRecord`
- `POST /api/Account/Domain/GetDomain`
- `POST /api/Account/Domain/GetDomainsPagedList`

The public Swagger page only describes the separate Automation Connector and does not include these DNS endpoints.

The direct transport uses TLS verification, a standards-aware `tough-cookie` jar, a 45-second request timeout, and a fixed provider origin. It rejects redirects instead of forwarding credentials to another location and does not include raw response bodies in error messages. Session files are written atomically with restrictive permissions on platforms that support Unix modes; on Windows, protect `~/.mhp-dns/` through its user-profile ACLs.

## Releases and npm publishing

Release Please maintains a release pull request based on Conventional Commits. Merging that pull request creates a GitHub release and publishes the same version through npm Trusted Publishing.

Use commit prefixes such as `fix:`, `feat:`, and `feat!:`. The npm Trusted Publisher is configured for:

- GitHub owner: `cveld`
- Repository: `mijnhostingpartner-dns-cli`
- Workflow: `release-please.yml`

The workflow uses OIDC and does not require an `NPM_TOKEN`. npm automatically attaches provenance when publishing through Trusted Publishing.

## License

[MIT](LICENSE)
