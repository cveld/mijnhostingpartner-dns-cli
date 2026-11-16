---
name: mijnhostingpartner-dns
description: Manage MijnHostingPartner DNS records and login using the local mhp-dns CLI. Use for MijnHostingPartner DNS requests, mhp-dns commands, or control-panel DNS URLs; use the HTTP client rather than automating the website.
metadata:
  author: cveld
  version: "0.1"
---

# MijnHostingPartner DNS

Requires Node.js 22+ and this repository. Chrome is needed only for explicitly requested interactive login/discovery.

Use the CLI in this repository for DNS management. Default login and DNS commands use native HTTP and persisted cookies, without Chrome or Playwright. Use `--headed` only when interactive MFA/CAPTCHA or first-time package discovery is needed. Read the README for credential setup details.

## Veiligheidsregels

- Toon vóór een mutatie welk record wordt toegevoegd, gewijzigd of verwijderd.
- Vraag expliciete toestemming voordat je een muterend commando uitvoert.
- Gebruik `--yes` pas nadat de gebruiker de concrete wijziging heeft bevestigd.
- Gebruik voor `update` en `delete` voldoende filters om precies één record te selecteren.
- Verwijder of wijzig geen NS-, MX-, SPF-, DKIM- of DMARC-record zonder expliciete opdracht.
- Plaats geen cookies, profielgegevens of credentials in de repository of in chat.
- Gebruik `--json` wanneer uitvoer programmatisch verwerkt moet worden.

## Project voorbereiden

Voer opdrachten uit vanuit de workspace-root via de wrapper:

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" --help
```

De wrapper installeert niets. Als `node_modules` ontbreekt:

```powershell
npm install
```

## Inloggen

Als de sessie ontbreekt of verlopen is:

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" login
```

Default login uses configured credentials directly over verified HTTPS and checks `CurrentUserInfo`. It saves cookies outside the repository in `~/.mhp-dns/http-session.json`. An existing interactive browser login is imported when no HTTP session exists. Expired sessions are refreshed with configured credentials before running the command; mutations are not automatically retried.

The default login requires credentials from environment or `.env`, including the existing DPAPI-protected Windows file. Without credentials it stops with setup instructions. Only the global `--headed` flag explicitly starts visible interactive Chrome; saved credentials are not automatically submitted in that mode. Let the user complete MFA/CAPTCHA and never bypass it:

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" login --env-file "C:\secure\mhp.env"
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" --headed login --env-file "C:\secure\mhp.env"
```

De zoekvolgorde is: bestaande environmentvariabelen, `--env-file`, `MHP_DNS_ENV_FILE`, `.env` in de huidige directory en ten slotte `~/.mhp-dns/.env`.

Als `login` meldt dat de gebruikersnaam of het wachtwoord ongeldig is, vertel dit zonder de waarden te tonen. Bied aan `credentials init --force` uit te voeren, maar doe dit pas na expliciete toestemming omdat het bestaande credentialbestand wordt vervangen.

Als de gebruiker credentials wil bewaren maar nog geen bestand heeft, laat de CLI dit interactief aanmaken. Het wachtwoord wordt niet weergegeven:

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" credentials init
```

Vraag vooraf toestemming omdat dit credentials bewaart. Op Windows gebruikt het scaffold standaard Windows Credential Manager (service `mhp-dns-cli`); alleen dezelfde Windows-gebruiker kan de waarden lezen en er wordt geen bestand geschreven. Bestaande `*_DPAPI`-bestanden blijven werken en worden bij eerste gebruik naar Credential Manager gekopieerd. Op andere platforms valt het terug op Base64, wat geen encryptie is. Met `--protection credential-manager|dpapi|base64` kan de methode expliciet worden gekozen. Gebruik `--force` alleen als de gebruiker expliciet heeft bevestigd dat bestaande opgeslagen credentials vervangen mogen worden. Zet credentials nooit in chat, logs of de repository en commit geen `.env`.

## Domein ontdekken en configureren

After login, discovery uses package identifiers already saved in the configuration:

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" domain discover example.nl
```

If no package is configured, provide `--package-id`, use the DNS URL fallback below, or explicitly request one browser-based discovery with `--headed domain discover example.nl`. Later commands use HTTP. Do not start Chrome silently.

Als fallback kan een DNS-recordpagina handmatig worden opgeslagen:

Sla een domein eenmalig op aan de hand van diens DNS-recordpagina:

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" domain add example.nl --url "https://control.mijnhostingpartner.nl/account/domains/dns-records?userId=123&packageId=456&id=789"
```

Als alleen een package-id bekend is, bekijk of configureer de beschikbare domeinen:

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" domain discover --package-id 456
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" domain discover example.nl --package-id 456
```

## Records bekijken

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" --json list example.nl
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" list example.nl --type TXT
```

Gebruik `@` als naam voor het zone-apex.

## Records wijzigen

Voer mutaties pas na expliciete bevestiging uit:

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" add example.nl api --type A --data 192.0.2.10 --ttl 3600 --yes

& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" update example.nl api --match-type A --match-data 192.0.2.10 --data 192.0.2.20 --yes

& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" delete example.nl api --type A --data 192.0.2.20 --yes
```

Zonder `--yes` vraagt de CLI zelf om bevestiging. Voor debugging kan `--headed` vóór het subcommando worden geplaatst.

## Implementatiedetails

The default transport is `src/http.ts`: native fetch, a standards-aware cookie jar, same-origin requests, verified TLS, no followed redirects, and no raw response bodies in errors. `src/browser.ts` is lazy-loaded only for explicit `--headed` commands. Login endpoints are `CurrentUserInfo`, `IsCaptchaRequired`, and `Login` under `/api/Auth/`. DNS payloads in `src/api.ts` retain these endpoints:

- `POST /api/Account/Domain/GetDomain`
- `POST /api/Account/Domain/GetDomainsPagedList`
- `POST /api/Account/DomainDns/GetDnsZoneRecords`
- `POST /api/Account/DomainDns/AddDnsZoneRecord`
- `POST /api/Account/DomainDns/UpdateDnsZoneRecord`
- `POST /api/Account/DomainDns/DeleteDnsZoneRecord`

Dit zijn ongedocumenteerde control-panel-endpoints. Als een opdracht breekt, inspecteer dan eerst de actuele netwerkrequests vanuit het DNS-scherm en werk de CLI bij; val niet direct terug op fragiele DOM-selectors.
