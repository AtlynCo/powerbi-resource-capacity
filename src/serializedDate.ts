export type SerializedDateFormat = "ISO-date" | "ISO-datetimeZ" | "ISO-datetime-offset" | "ISO-datetime-no-zone" | "other";
export interface SerializedDate {
  format: SerializedDateFormat;
  validity: "valid" | "invalid-or-unsupported";
  date?: Date;
}

// Deliberately excludes locale-dependent dates, epoch strings and unbounded input.
const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:\d{2})?)?$/;

export function parseSerializedDate(value: string): SerializedDate {
  const match = value.length <= 40 ? iso.exec(value) : null;
  if (!match || match[0].length !== value.length) return { format: "other", validity: "invalid-or-unsupported" };
  const zone = match[8];
  const format: SerializedDateFormat = match[4] === undefined ? "ISO-date" :
    zone === "Z" ? "ISO-datetimeZ" : zone ? "ISO-datetime-offset" : "ISO-datetime-no-zone";
  const invalid: SerializedDate = { format, validity: "invalid-or-unsupported" };
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const hour = Number(match[4] ?? 0), minute = Number(match[5] ?? 0), second = Number(match[6] ?? 0);
  const fraction = match[7] ?? "";
  const millisecond = Number(fraction.slice(0, 3).padEnd(3, "0"));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59 ||
      /[1-9]/.test(fraction.slice(3))) return invalid;

  // Validate calendar components before applying an offset; Date setters otherwise roll invalid days.
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, millisecond);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return invalid;

  let date: Date;
  if (zone) {
    let offset = 0;
    if (zone !== "Z") {
      const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4, 6));
      if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return invalid;
      offset = (hours * 60 + minutes) * (zone[0] === "+" ? 1 : -1);
    }
    date = new Date(calendar.getTime() - offset * 60000);
  } else {
    // Zone-free dates retain local calendar fields, matching ordinary host Date construction.
    date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(hour, minute, second, millisecond);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
        date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second ||
        date.getMilliseconds() !== millisecond) return invalid;
  }
  return Number.isFinite(date.getTime()) ? { format, validity: "valid", date } : invalid;
}
