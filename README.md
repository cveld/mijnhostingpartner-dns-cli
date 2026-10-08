# MijnHostingPartner DNS CLI

A command-line tool for managing DNS records at [MijnHostingPartner.nl](https://www.mijnhostingpartner.nl/).

The CLI uses Playwright to keep an authenticated Chrome profile. After authentication, commands call the control panel's internal JSON endpoints directly, which is faster and less brittle than automating UI interactions.

> [!WARNING]
> This project uses an undocumented control-panel API. MijnHostingPartner may change its endpoints or payloads without notice.

## Requirements

- Node.js 22 or newer
- Google Chrome
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

The CLI opens Chrome in headed mode. Sign in manually and complete MFA if required. The CLI detects a successful login automatically and then closes Chrome. Cookies and session data are stored outside the repository in `~/.mhp-dns/`.

Optionally, put the credentials in a `.env` file. Copy `.env.example` to `.env`, fill in both values, and keep the file out of source control:

```dotenv
MHP_DNS_USERNAME=your-login
MHP_DNS_PASSWORD=your-password
```

Then run `login` normally. The CLI reads `.env` from the current directory, fills in the login form, and runs Chrome headlessly:

```powershell
npx mijnhostingpartner-dns-cli login
```

`login` requires configured credentials for its default headless flow. If no credentials are configured, it exits with instructions instead of opening a browser.

Use the global option before the command to explicitly start the visible, fully interactive login flow (saved credentials are not submitted in this mode):

```powershell
npx mijnhostingpartner-dns-cli --headed login
```

Interactive MFA therefore requires `--headed`.

Invalid saved credentials fail immediately with a clear error and can be replaced with:

```powershell
npx mijnhostingpartner-dns-cli credentials init --force
```

The lookup order is: existing environment variables, `--env-file`, `MHP_DNS_ENV_FILE`, `.env` in the current directory, then `~/.mhp-dns/.env`.

The CLI can securely scaffold the user-profile file. The password is not echoed:

```powershell
npx mijnhostingpartner-dns-cli credentials init
```

On Windows, scaffolded credentials are encrypted by default with DPAPI using the current Windows user. Another user account or computer cannot decrypt them. On other platforms, the fallback is Base64 encoding. Select explicitly with `--protection dpapi` or `--protection base64`. Base64 is not encryption; protect such a file like a password. Use `--force` to replace an existing file. To use a file elsewhere, pass `--env-file` or set `MHP_DNS_ENV_FILE`:

```powershell
npx mijnhostingpartner-dns-cli login --env-file C:\secure\mhp.env
```

Already-set `MHP_DNS_USERNAME` and `MHP_DNS_PASSWORD` environment variables take precedence over values in the file. Do not commit a credential-bearing `.env` file.

## Register a domain

After signing in, let the CLI find and save the identifiers for a domain from the control panel:

```powershell
npx mijnhostingpartner-dns-cli domain discover example.nl
```

This is the preferred flow; users do not need to copy internal identifiers or URLs.

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
| `MHP_DNS_HOME` | Location of the configuration and browser profile |
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

- `POST /api/Account/DomainDns/GetDnsZoneRecords`
- `POST /api/Account/DomainDns/AddDnsZoneRecord`
- `POST /api/Account/DomainDns/UpdateDnsZoneRecord`
- `POST /api/Account/DomainDns/DeleteDnsZoneRecord`
- `POST /api/Account/Domain/GetDomain`
- `POST /api/Account/Domain/GetDomainsPagedList`

The public Swagger page only describes the separate Automation Connector and does not include these DNS endpoints.

## Releases and npm publishing

Release Please maintains a release pull request based on Conventional Commits. Merging that pull request creates a GitHub release and publishes the same version through npm Trusted Publishing.

Use commit prefixes such as `fix:`, `feat:`, and `feat!:`. The npm Trusted Publisher is configured for:

- GitHub owner: `cveld`
- Repository: `mijnhostingpartner-dns-cli`
- Workflow: `release-please.yml`

The workflow uses OIDC and does not require an `NPM_TOKEN`. npm automatically attaches provenance when publishing through Trusted Publishing.

## License

[MIT](LICENSE)
