# MijnHostingPartner DNS CLI

Read the shared personal instructions and the active agent supplement first.
Read `README.md` and `.github/skills/mijnhostingpartner-dns/SKILL.md` before work.

## Architecture

- `src/http.ts` is the default native HTTP transport and cookie-session manager.
- `src/api.ts` owns the existing DNS/domain endpoint payloads independently of the transport.
- `src/browser.ts` is lazy-loaded only for explicitly requested `--headed` flows.
- Preserve existing CLI arguments, domain configuration and DPAPI credential protection.
- First-time package discovery without configured identifiers requires `--package-id`,
  `domain add --url`, or explicit `--headed domain discover`.

## Safety and verification

- Never print credentials, session cookies, raw login responses or private browser state.
- Keep credentials/session files outside the repository, under `~/.mhp-dns/` by default.
- Never disable TLS checks, follow credential-bearing redirects or replay mutations automatically.
- Show each concrete DNS mutation and obtain explicit confirmation before `--yes`.
- Use exact record filters; do not change mail or nameserver records incidentally.
- Run `npm run check`, `npm test`, and `npm run build` after changes.
- Live verification should be read-only unless the user explicitly approves a specific DNS mutation.
- Do not commit, publish to npm or modify the globally installed version unless requested.
