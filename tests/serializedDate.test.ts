import { describe, expect, it } from "vitest";
import { parseSerializedDate } from "../src/serializedDate";

describe("strict native ISO date normalization", () => {
  it.each([
    ["2026-08-03T12:34:56Z", "2026-08-03T12:34:56.000Z", "ISO-datetimeZ"],
    ["2026-08-03T12:34:56.1Z", "2026-08-03T12:34:56.100Z", "ISO-datetimeZ"],
    ["2026-08-03T12:34:56.1230000Z", "2026-08-03T12:34:56.123Z", "ISO-datetimeZ"],
    ["2026-08-03T12:34:56.123+05:30", "2026-08-03T07:04:56.123Z", "ISO-datetime-offset"],
    ["2026-08-03T12:34:56-07:00", "2026-08-03T19:34:56.000Z", "ISO-datetime-offset"],
    ["2026-01-01T00:00:00+14:00", "2025-12-31T10:00:00.000Z", "ISO-datetime-offset"],
    ["0001-01-01T00:00:00Z", "0001-01-01T00:00:00.000Z", "ISO-datetimeZ"],
    ["0099-12-31T00:00:00Z", "0099-12-31T00:00:00.000Z", "ISO-datetimeZ"],
    ["2000-02-29T23:59:59.999Z", "2000-02-29T23:59:59.999Z", "ISO-datetimeZ"]
  ])("preserves the exact instant of %s", (input, expected, format) => {
    const result = parseSerializedDate(input);
    expect(result).toMatchObject({ format, validity: "valid" });
    expect(result.date?.toISOString()).toBe(expected);
    expect(result.date?.getTime()).toBe(Date.parse(input));
  });

  it.each(["2026-08-03", "2026-08-03T00:00:00", "2026-08-03T00:00:00.0000000"])(
    "preserves zone-free calendar fields without UTC date-only coercion: %s", input => {
      const result = parseSerializedDate(input);
      expect(result.validity).toBe("valid");
      expect(result.date?.getTime()).toBe(new Date(2026, 7, 3).getTime());
    }
  );

  it.each([
    "2026-02-29", "1900-02-29", "2026-02-30T00:00:00Z", "2026-04-31T00:00:00-07:00",
    "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32",
    "2026-08-03T24:00:00Z", "2026-08-03T12:60:00Z", "2026-08-03T12:00:60Z",
    "2026-08-03T00:00:00+14:01", "2026-08-03T00:00:00-15:00", "2026-08-03T00:00:00+01:60",
    "2026-08-03T00:00:00.1234Z", "2026-08-03T00:00:00.0000001"
  ])("rejects impossible or lossy ISO date components: %s", input => {
    expect(parseSerializedDate(input)).toEqual({
      format: expect.stringMatching(/^ISO-/), validity: "invalid-or-unsupported"
    });
  });

  it.each(["08/03/2026", "3 August 2026", "2026-8-3", "2026", "1785715200000", "/Date(1785715200000)/",
    "", " ", " 2026-08-03", "2026-08-03 ", "2026-08-03\n", "2026-08-03T00:00Z", "2026-08-03 00:00:00",
    "2026-08-03T00:00:00z", "2026-08-03T00:00:00+0000", "x".repeat(10000)])(
    "does not parse unapproved representations: %s", input => {
      expect(parseSerializedDate(input)).toEqual({ format: "other", validity: "invalid-or-unsupported" });
    }
  );
});
