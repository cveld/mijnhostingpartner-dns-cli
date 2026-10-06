import assert from "node:assert/strict";
import test from "node:test";
import { parseDnsUrl } from "../src/config.js";

test("parses a control-panel DNS URL", () => {
  assert.deepEqual(parseDnsUrl("https://control.mijnhostingpartner.nl/account/domains/dns-records?userId=1&packageId=2&id=3"), {
    userId: 1, packageId: 2, domainId: 3,
  });
});

test("rejects unrelated URLs", () => {
  assert.throws(() => parseDnsUrl("https://example.com/?id=3"));
});
