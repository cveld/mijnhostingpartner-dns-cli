---
name: mijnhostingpartner-dns
description: Beheer DNS-records bij MijnHostingPartner.nl met de lokale mhp-dns CLI. Gebruik deze skill altijd wanneer de gebruiker DNS-records bij MijnHostingPartner wil bekijken, toevoegen, wijzigen of verwijderen, een MijnHostingPartner-login of Playwright-sessie wil instellen, een control.mijnhostingpartner.nl DNS-URL deelt, of mhp-dns noemt. Gebruik de bestaande CLI en de opgeslagen Playwright-browserlogin in plaats van zelf de website te automatiseren.
compatibility: Vereist Node.js 22+, Google Chrome en deze repository. Werkt op Windows, macOS en Linux.
metadata:
  author: cveld
  version: "0.1"
---

# MijnHostingPartner DNS

Gebruik de CLI in deze repository voor DNS-beheer. De CLI start Chrome met een apart persistent profiel. Alleen `login` is standaard headed; andere opdrachten zijn headless tenzij `--headed` wordt meegegeven.

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

Laat de gebruiker zelf inloggen en eventuele MFA afronden. De CLI detecteert de geslaagde login automatisch, verifieert deze op de domeinenpagina en slaat de browserstatus buiten de repository op in `~/.mhp-dns/`.

De standaardlogin vereist credentials uit environment of `.env` en draait headless. Zonder credentials stopt de CLI met instructies om eerst `credentials init` te gebruiken of `--env-file` mee te geven. Alleen de globale vlag `--headed` vóór `login` start de zichtbare, volledig interactieve loginflow; opgeslagen credentials worden in die modus niet automatisch ingevuld:

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

Vraag vooraf toestemming omdat dit credentials op schijf bewaart. Op Windows gebruikt het scaffold standaard DPAPI met scope `CurrentUser`; alleen dezelfde Windows-gebruiker op dezelfde machine kan de waarden ontsleutelen. Op andere platforms valt het terug op Base64, wat geen encryptie is. Met `--protection dpapi|base64` kan de methode expliciet worden gekozen. Gebruik `--force` alleen als de gebruiker expliciet heeft bevestigd dat het bestaande bestand vervangen mag worden. Zet credentials nooit in chat, logs of de repository en commit geen `.env`.

## Domein ontdekken en configureren

Na de eenmalige login hoeft de gebruiker geen control-panel-URL of interne identifiers te zoeken. Laat de CLI de DNS-link op de domeinenpagina uitlezen en de identifiers opslaan:

```powershell
& ".github/skills/mijnhostingpartner-dns/scripts/mhp-dns.ps1" domain discover example.nl
```

Gebruik dit als standaardroute wanneer een domein nog niet is geconfigureerd. Vraag de gebruiker alleen om opnieuw in te loggen als de opgeslagen sessie verlopen is.

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

De CLI gebruikt de cookie-authenticatie uit het Playwright-profiel en roept deze interne endpoints aan:

- `POST /api/Account/Domain/GetDomain`
- `POST /api/Account/Domain/GetDomainsPagedList`
- `POST /api/Account/DomainDns/GetDnsZoneRecords`
- `POST /api/Account/DomainDns/AddDnsZoneRecord`
- `POST /api/Account/DomainDns/UpdateDnsZoneRecord`
- `POST /api/Account/DomainDns/DeleteDnsZoneRecord`

Dit zijn ongedocumenteerde control-panel-endpoints. Als een opdracht breekt, inspecteer dan eerst de actuele netwerkrequests vanuit het DNS-scherm en werk de CLI bij; val niet direct terug op fragiele DOM-selectors.
