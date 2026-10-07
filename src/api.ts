import type { APIRequestContext } from "playwright-core";
import { baseUrl } from "./browser.js";
import type { DnsRecord, Domain, DomainContext, DomainPage, RecordInput } from "./types.js";

function dnsRecord(input: RecordInput): Record<string, unknown> {
  return {
    Id: 0, DomainId: 0,
    RecordName: input.name === "@" ? "" : input.name,
    RecordType: input.type, RecordData: input.data, RecordText: null,
    TimeToLive: input.ttl, MxPriority: input.mxPriority ?? 0,
    SrvPriority: input.srvPriority ?? 0, SrvPort: input.srvPort ?? 0,
    SrvWeight: input.srvWeight ?? 0, CaaFlags: input.caaFlags ?? 0,
    CaaTag: input.caaTag ?? "issue", CaaValue: input.caaValue ?? null,
    DnsServer: null, CreatedDate: null,
  };
}

export class MhpApi {
  public constructor(private readonly request: APIRequestContext) {}

  private async post<T>(path: string, data: unknown): Promise<T> {
    const response = await this.request.post(`${baseUrl}${path}`, { data });
    const text = await response.text();
    if (!response.ok()) throw new Error(`${path} failed (${response.status()}): ${text || response.statusText()}`);
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  listRecords(domainId: number): Promise<DnsRecord[]> {
    return this.post("/api/Account/DomainDns/GetDnsZoneRecords", domainId);
  }

  getDomain(domainId: number): Promise<Domain> {
    return this.post("/api/Account/Domain/GetDomain", domainId);
  }

  listDomains(packageId: number): Promise<DomainPage> {
    return this.post("/api/Account/Domain/GetDomainsPagedList", {
      packageId,
      filter: { FilterColumn: null, FilterValue: "%%", OrderBy: "Name", PageIndex: 0, PageSize: 1000 },
      recursive: false,
    });
  }

  addRecord(domainId: number, input: RecordInput): Promise<unknown> {
    return this.post("/api/Account/DomainDns/AddDnsZoneRecord", { domainId, newDnsRecord: dnsRecord(input) });
  }

  updateRecord(domainId: number, original: DnsRecord, input: RecordInput): Promise<unknown> {
    return this.post("/api/Account/DomainDns/UpdateDnsZoneRecord", {
      domainId, originalRecordName: original.recordName,
      originalRecordData: original.recordData, dnsRecord: dnsRecord(input),
    });
  }

  deleteRecord(domainId: number, record: DnsRecord): Promise<unknown> {
    return this.post("/api/Account/DomainDns/DeleteDnsZoneRecord", {
      domainId, recordName: record.recordName,
      recordType: record.recordType, recordData: record.recordData,
    });
  }
}

export function dnsUrl(context: DomainContext): string {
  const url = new URL("/account/domains/dns-records", baseUrl);
  if (context.userId) url.searchParams.set("userId", String(context.userId));
  if (context.packageId) url.searchParams.set("packageId", String(context.packageId));
  url.searchParams.set("id", String(context.domainId));
  return url.toString();
}

export function domainContextFromDnsUrl(value: string): DomainContext | undefined {
  try {
    const url = new URL(value, baseUrl);
    if (url.hostname !== new URL(baseUrl).hostname || !url.pathname.endsWith("/account/domains/dns-records")) return undefined;
    const positiveInteger = (name: string) => {
      const value = Number(url.searchParams.get(name));
      return Number.isInteger(value) && value > 0 ? value : undefined;
    };
    const domainId = positiveInteger("id");
    if (!domainId) return undefined;
    return { domainId, userId: positiveInteger("userId"), packageId: positiveInteger("packageId") };
  } catch {
    return undefined;
  }
}

export function packageContextFromDomainsUrl(value: string): Pick<DomainContext, "userId" | "packageId"> | undefined {
  try {
    const url = new URL(value, baseUrl);
    if (url.hostname !== new URL(baseUrl).hostname || !url.pathname.endsWith("/account/domains/index")) return undefined;
    const positiveInteger = (name: string) => {
      const value = Number(url.searchParams.get(name));
      return Number.isInteger(value) && value > 0 ? value : undefined;
    };
    const packageId = positiveInteger("packageId");
    if (!packageId) return undefined;
    return { userId: positiveInteger("userId"), packageId };
  } catch {
    return undefined;
  }
}

export function findRecords(records: DnsRecord[], name: string, type?: string, data?: string): DnsRecord[] {
  const normalizedName = name === "@" ? "" : name;
  return records.filter(record =>
    record.recordName.toLowerCase() === normalizedName.toLowerCase()
    && (!type || record.recordType === type.toUpperCase())
    && (!data || record.recordData === data));
}

export function toRecordInput(record: DnsRecord): RecordInput {
  return {
    name: record.recordName, type: record.recordType, data: record.recordData,
    ttl: record.timeToLive, mxPriority: record.mxPriority,
    srvPriority: record.srvPriority, srvPort: record.srvPort,
    srvWeight: record.srvWeight, caaFlags: record.caaFlags,
    caaTag: record.caaTag ?? undefined, caaValue: record.caaValue ?? undefined,
  };
}
