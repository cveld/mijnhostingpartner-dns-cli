export const recordTypes = ["A", "AAAA", "CAA", "CNAME", "MX", "NS", "SRV", "TXT"] as const;

export type DnsRecordType = (typeof recordTypes)[number];

export interface DnsRecord {
  id: number;
  domainId: number;
  recordName: string;
  recordType: DnsRecordType;
  recordData: string;
  recordText: string | null;
  timeToLive: number;
  mxPriority: number;
  srvPriority: number;
  srvPort: number;
  srvWeight: number;
  caaFlags: number;
  caaTag: string | null;
  caaValue: string | null;
  dnsServer: string | null;
  createdDate: string | null;
}

export interface Domain {
  id: number;
  name: string;
  dnsEnabled: boolean;
  userId: number | null;
  packageId: number | null;
}

export interface DomainPage {
  total: number;
  data: Domain[];
}

export interface DomainContext {
  domainId: number;
  domainName?: string;
  userId?: number;
  packageId?: number;
}

export interface RecordInput {
  name: string;
  type: DnsRecordType;
  data: string;
  ttl: number;
  mxPriority?: number;
  srvPriority?: number;
  srvPort?: number;
  srvWeight?: number;
  caaFlags?: number;
  caaTag?: string;
  caaValue?: string;
}
