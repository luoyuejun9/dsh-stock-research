import { createHash } from "node:crypto";

function configuredSecrets(): string[] { return [process.env.TUSHARE_TOKEN, process.env.ALPHAVANTAGE_API_KEY].filter((value): value is string => Boolean(value)); }

export function sha256(input: string): string { return createHash("sha256").update(input).digest("hex"); }
export function stableStringify(value: unknown): string { return `${JSON.stringify(value, null, 2)}\n`; }
export function redact(value: string): string {
  let result = value.replace(/([?&](?:apikey|token)=)[^&\s]+/giu, "$1[REDACTED]");
  for (const secret of configuredSecrets()) result = result.replaceAll(secret, "[REDACTED]");
  return result;
}
export function assertNoSecret(value: string): void {
  if (configuredSecrets().some((secret) => value.includes(secret))) throw new Error("refusing to persist credential material");
}
export function finite(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
export function isoDate(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  if (/^\d{8}$/u.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/u.test(text)) return text.slice(0, 10);
  return undefined;
}
