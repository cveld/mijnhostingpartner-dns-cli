# MijnHostingPartner DNS CLI

CLI voor DNS-beheer bij MijnHostingPartner. Playwright bewaart een apart Chrome-profiel voor de login. De commando's gebruiken daarna rechtstreeks de interne JSON-endpoints van het control panel; dat is sneller en minder kwetsbaar dan knoppen aanklikken.

> Dit is een ongedocumenteerde control-panel-API. MijnHostingPartner kan endpoints of payloads zonder aankondiging wijzigen.

## Installeren

Node.js 22+ en Google Chrome zijn vereist.

Zonder installatie, via npm:

```powershell
npx mijnhostingpartner-dns-cli login
npx mijnhostingpartner-dns-cli list example.nl
```

Of installeer de CLI globaal:

```powershell
npm install --global mijnhostingpartner-dns-cli
mhp-dns --help
```

Voor lokale ontwikkeling:

```powershell
npm install
npm run build
npm link
```

## Eenmalig inloggen

```powershell
mhp-dns login
```

Chrome start headed. Log handmatig in en druk daarna in de terminal op Enter. Cookies en sessiegegevens staan buiten de repository in `~/.mhp-dns/browser-profile`.

## Domein registreren

Kopieer de URL van de DNS-recordpagina:

```powershell
mhp-dns domain add example.nl --url "https://control.mijnhostingpartner.nl/account/domains/dns-records?userId=123&packageId=456&id=789"
```

Alleen de identifiers worden opgeslagen; niet de DNS-records of credentials.

## Gebruik

```powershell
mhp-dns list example.nl
mhp-dns list example.nl --type TXT --json
mhp-dns add example.nl api --type A --data 192.0.2.10 --ttl 3600
mhp-dns update example.nl api --match-type A --data 192.0.2.20
mhp-dns delete example.nl api --type A --data 192.0.2.20
```

Gebruik `@` voor het zone-apex. Wijzigingen vragen bevestiging; `--yes` slaat die over. Met de globale optie `--headed` blijft Chrome zichtbaar tijdens een commando:

```powershell
mhp-dns --headed list example.nl
```

Environmentvariabelen:

- `MHP_DNS_HOME`: locatie van configuratie en browserprofiel.
- `MHP_DNS_PROFILE`: afwijkende locatie van het browserprofiel.
- `MHP_DNS_CONFIG`: afwijkend configuratiebestand.
- `MHP_DNS_CHROME`: expliciet pad naar Chrome.

## Ontdekte endpoints

- `POST /api/Account/DomainDns/GetDnsZoneRecords`
- `POST /api/Account/DomainDns/AddDnsZoneRecord`
- `POST /api/Account/DomainDns/UpdateDnsZoneRecord`
- `POST /api/Account/DomainDns/DeleteDnsZoneRecord`
- `POST /api/Account/Domain/GetDomain`
- `POST /api/Account/Domain/GetDomainsPagedList`

De publieke Swagger-pagina beschrijft alleen de losse Automation Connector en niet deze DNS-endpoints.

## Releases en npm-publicatie

Release Please onderhoudt op basis van Conventional Commits een release-PR. Na het mergen van die PR maakt de workflow een GitHub-release en publiceert dezelfde versie via npm Trusted Publishing.

Gebruik commit-prefixen als `fix:`, `feat:` en `feat!:`. Configureer bij het npm-package GitHub Actions als Trusted Publisher:

- GitHub owner: `cveld`
- Repository: `mijnhostingpartner-dns-cli`
- Workflow: `release-please.yml`

De workflow heeft `id-token: write` en gebruikt een npm-versie met OIDC-ondersteuning. Er is geen `NPM_TOKEN` nodig. npm voegt bij publicatie via Trusted Publishing automatisch provenance toe.
