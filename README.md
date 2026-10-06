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

The CLI opens Chrome in headed mode. Sign in manually, complete MFA if required, and then press Enter in the terminal. Cookies and session data are stored outside the repository in `~/.mhp-dns/browser-profile`.

## Register a domain

Copy the URL of the domain's DNS records page from the control panel:

```powershell
npx mijnhostingpartner-dns-cli domain add example.nl --url "https://control.mijnhostingpartner.nl/account/domains/dns-records?userId=123&packageId=456&id=789"
```

Only the domain identifiers are saved. Credentials and DNS records are not written to the configuration file.

If you only know the hosting package ID, discover its domains first:

```powershell
npx mijnhostingpartner-dns-cli domain discover --package-id 456
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
