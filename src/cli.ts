#!/usr/bin/env node
import { createRequire } from "node:module";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Command } from "commander";
import { MhpApi, findRecords, toRecordInput } from "./api.js";
import { assertLoggedIn, baseUrl, getPage, openBrowser } from "./browser.js";
import { getDomain, parseDnsUrl, profileDirectory, saveDomain } from "./config.js";
import { recordTypes, type DnsRecord, type DnsRecordType, type RecordInput } from "./types.js";

interface GlobalOptions { headed?: boolean; json?: boolean }
const packageVersion = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
const globals = (command: Command) => command.optsWithGlobals<GlobalOptions>();

async function session<T>(command: Command, action: (api: MhpApi) => Promise<T>): Promise<T> {
  const context = await openBrowser(Boolean(globals(command).headed));
  try {
    const page = await getPage(context);
    await assertLoggedIn(page);
    return await action(new MhpApi(context.request));
  } finally { await context.close(); }
}

function output(value: unknown, json = false): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (Array.isArray(value)) console.table(value);
  else console.log(value);
}

function asType(value: string): DnsRecordType {
  const type = value.toUpperCase();
  if (!recordTypes.includes(type as DnsRecordType)) throw new Error(`Unsupported record type '${value}'.`);
  return type as DnsRecordType;
}

function integer(value: string): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) throw new Error(`Expected a non-negative integer, got '${value}'.`);
  return result;
}

async function confirm(question: string, yes?: boolean): Promise<void> {
  if (yes) return;
  if (!stdin.isTTY) throw new Error("Confirmation requires an interactive terminal; pass --yes to proceed.");
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question(`${question} [y/N] `);
    if (!/^y(es)?$/i.test(answer.trim())) throw new Error("Cancelled.");
  } finally { prompt.close(); }
}

function recordOptions(command: Command): Command {
  return command
    .requiredOption("--type <type>", `record type: ${recordTypes.join(", ")}`, asType)
    .requiredOption("--data <value>", "record value")
    .option("--ttl <seconds>", "TTL (0 uses provider default)", integer, 0)
    .option("--mx-priority <number>", "MX priority", integer)
    .option("--srv-priority <number>", "SRV priority", integer)
    .option("--srv-port <number>", "SRV port", integer)
    .option("--srv-weight <number>", "SRV weight", integer)
    .option("--caa-flags <number>", "CAA flags", integer)
    .option("--caa-tag <tag>", "CAA tag", "issue")
    .option("--caa-value <value>", "CAA value");
}

function input(name: string, options: Record<string, unknown>): RecordInput {
  return {
    name, type: options.type as DnsRecordType, data: String(options.data),
    ttl: options.ttl as number, mxPriority: options.mxPriority as number | undefined,
    srvPriority: options.srvPriority as number | undefined, srvPort: options.srvPort as number | undefined,
    srvWeight: options.srvWeight as number | undefined, caaFlags: options.caaFlags as number | undefined,
    caaTag: options.caaTag as string | undefined, caaValue: options.caaValue as string | undefined,
  };
}

function displayRecords(records: DnsRecord[]): object[] {
  return records.map(record => ({
    name: record.recordName || "@", type: record.recordType, data: record.recordData,
    ttl: record.timeToLive,
    extra: record.recordType === "MX" ? `priority=${record.mxPriority}`
      : record.recordType === "SRV" ? `priority=${record.srvPriority} weight=${record.srvWeight} port=${record.srvPort}`
      : record.recordType === "CAA" ? `flags=${record.caaFlags} tag=${record.caaTag ?? ""}` : "",
  }));
}

const program = new Command()
  .name("mhp-dns")
  .description("Manage MijnHostingPartner DNS through its control-panel API and a persisted Playwright login.")
  .version(packageVersion)
  .option("--headed", "show Chrome while running")
  .option("--json", "write machine-readable JSON");

program.command("login")
  .description("open Chrome and save an authenticated session")
  .action(async () => {
    const context = await openBrowser(true);
    const page = await getPage(context);
    await page.goto(baseUrl);
    console.log(`Chrome profile: ${profileDirectory}`);
    console.log("Log in in Chrome, then press Enter here.");
    const prompt = createInterface({ input: stdin, output: stdout });
    try { await prompt.question(""); await assertLoggedIn(page); }
    finally { prompt.close(); await context.close(); }
    console.log("Login saved.");
  });

const domain = program.command("domain").description("configure domain identifiers");
domain.command("add").argument("<domain>").requiredOption("--url <url>", "DNS records URL from the control panel")
  .action(async (name: string, options: { url: string }, command: Command) => {
    const parsed = parseDnsUrl(options.url);
    const found = await session(command, api => api.getDomain(parsed.domainId));
    if (found.name.toLowerCase() !== name.toLowerCase()) throw new Error(`URL belongs to '${found.name}', not '${name}'.`);
    await saveDomain(name, { ...parsed, domainName: found.name });
    output({ domain: found.name, domainId: found.id, config: "saved" }, globals(command).json);
  });

domain.command("discover").requiredOption("--package-id <id>", "hosting package id", integer)
  .description("list domains in a hosting package")
  .action(async (options: { packageId: number }, command: Command) => {
    const result = await session(command, api => api.listDomains(options.packageId));
    output(result.data.map(item => ({ name: item.name, domainId: item.id, dnsEnabled: item.dnsEnabled })), globals(command).json);
  });

program.command("list").argument("<domain>")
  .option("--type <type>", "filter by record type", asType)
  .option("--name <name>", "filter by name; use @ for the zone apex")
  .action(async (name: string, options: { type?: DnsRecordType; name?: string }, command: Command) => {
    const context = await getDomain(name);
    let records = await session(command, api => api.listRecords(context.domainId));
    if (options.type) records = records.filter(record => record.recordType === options.type);
    if (options.name !== undefined) records = findRecords(records, options.name);
    output(globals(command).json ? records : displayRecords(records), globals(command).json);
  });

recordOptions(program.command("add").argument("<domain>").argument("<name>").description("add a DNS record"))
  .option("--yes", "skip confirmation")
  .action(async (domainName: string, name: string, options: Record<string, unknown>, command: Command) => {
    const context = await getDomain(domainName);
    const record = input(name, options);
    await confirm(`Add ${record.type} ${record.name || "@"} -> ${record.data} to ${domainName}?`, options.yes as boolean);
    await session(command, api => api.addRecord(context.domainId, record));
    output({ status: "added", domain: domainName, ...record }, globals(command).json);
  });

program.command("update").argument("<domain>").argument("<name>").description("update one uniquely matched record")
  .option("--match-type <type>", "existing record type", asType)
  .option("--match-data <value>", "existing record value")
  .option("--new-name <name>", "new record name")
  .option("--new-type <type>", "new record type", asType)
  .option("--data <value>", "new record value")
  .option("--ttl <seconds>", "new TTL", integer)
  .option("--yes", "skip confirmation")
  .action(async (domainName: string, name: string, options: Record<string, unknown>, command: Command) => {
    const context = await getDomain(domainName);
    await session(command, async api => {
      const matches = findRecords(await api.listRecords(context.domainId), name, options.matchType as string, options.matchData as string);
      if (matches.length !== 1) throw new Error(`Expected exactly one matching record, found ${matches.length}. Add --match-type and/or --match-data.`);
      const current = matches[0];
      const next: RecordInput = {
        ...toRecordInput(current),
        name: (options.newName as string | undefined) ?? current.recordName,
        type: (options.newType as DnsRecordType | undefined) ?? current.recordType,
        data: (options.data as string | undefined) ?? current.recordData,
        ttl: (options.ttl as number | undefined) ?? current.timeToLive,
      };
      await confirm(`Update ${current.recordType} ${current.recordName || "@"} -> ${current.recordData} to ${next.type} ${next.name || "@"} -> ${next.data}?`, options.yes as boolean);
      await api.updateRecord(context.domainId, current, next);
      output({ status: "updated", domain: domainName, before: current, after: next }, globals(command).json);
    });
  });

program.command("delete").argument("<domain>").argument("<name>").description("delete one uniquely matched record")
  .option("--type <type>", "record type", asType)
  .option("--data <value>", "record value")
  .option("--yes", "skip confirmation")
  .action(async (domainName: string, name: string, options: { type?: DnsRecordType; data?: string; yes?: boolean }, command: Command) => {
    const context = await getDomain(domainName);
    await session(command, async api => {
      const matches = findRecords(await api.listRecords(context.domainId), name, options.type, options.data);
      if (matches.length !== 1) throw new Error(`Expected exactly one matching record, found ${matches.length}. Add --type and/or --data.`);
      const record = matches[0];
      await confirm(`Delete ${record.recordType} ${record.recordName || "@"} -> ${record.recordData} from ${domainName}?`, options.yes);
      await api.deleteRecord(context.domainId, record);
      output({ status: "deleted", domain: domainName, record }, globals(command).json);
    });
  });

await program.parseAsync().catch(error => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
