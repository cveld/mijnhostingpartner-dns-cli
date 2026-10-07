import assert from "node:assert/strict";
import test from "node:test";
import { domainContextFromDnsUrl, findRecords, packageContextFromDomainsUrl } from "../src/api.js";
import type { DnsRecord } from "../src/types.js";

const records = [
  { recordName: "", recordType: "A", recordData: "192.0.2.1" },
  { recordName: "www", recordType: "A", recordData: "192.0.2.2" },
] as DnsRecord[];

test("uses @ as apex shorthand", () => {
  assert.equal(findRecords(records, "@").length, 1);
  assert.equal(findRecords(records, "@")[0].recordData, "192.0.2.1");
});

test("can disambiguate records", () => {
  assert.equal(findRecords(records, "www", "A", "192.0.2.2").length, 1);
});

test("extracts domain identifiers from a DNS link", () => {
  assert.deepEqual(domainContextFromDnsUrl("https://control.mijnhostingpartner.nl/account/domains/dns-records?userId=1&packageId=2&id=3"), {
    userId: 1, packageId: 2, domainId: 3,
  });
});

test("ignores unrelated links during discovery", () => {
  assert.equal(domainContextFromDnsUrl("https://example.com/account/domains/dns-records?id=3"), undefined);
});

test("extracts package identifiers from a domains link", () => {
  assert.deepEqual(packageContextFromDomainsUrl("https://control.mijnhostingpartner.nl/account/domains/index?userId=22440&packageId=40539"), {
    userId: 22440, packageId: 40539,
  });
});
