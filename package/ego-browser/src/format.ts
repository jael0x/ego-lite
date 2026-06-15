export function formatCliLogValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (value === undefined) {
    return "undefined";
  }
  return JSON.stringify(value);
}

type WritableLike = { write(chunk: string): unknown };

/**
 * Build a `cliLog(...)` function that writes space-joined, formatted values plus
 * a newline to the given stream. Shared by the CLI runtime (run.ts) and the
 * in-browser SDK installer (index.ts) so the two cannot drift.
 */
export function createCliLog(stream: WritableLike) {
  return (...args: unknown[]) => {
    stream.write(`${args.map(formatCliLogValue).join(" ")}\n`);
  };
}
