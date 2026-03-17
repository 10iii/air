export function strictParseInt(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) return NaN;
  return Number(value);
}

export function requirePositiveInteger(
  label: string,
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) {
    process.stderr.write(`Error: --${label} must be a positive integer\n`);
    process.exit(1);
  }
  return Math.floor(value);
}
