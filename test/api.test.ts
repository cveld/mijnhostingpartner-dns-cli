import assert from "node:assert/strict";
import test from "node:test";
import { findRecords } from "../src/api.js";
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
