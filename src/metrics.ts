import type { DerivedMetrics, FinancialPeriod, PriceBar } from "./types.js";

function change(newer: number | undefined, older: number | undefined): number | undefined { return newer !== undefined && older !== undefined && older !== 0 ? (newer / older - 1) * 100 : undefined; }
function sampleStd(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}
export function deriveMetrics(prices: PriceBar[], financials: FinancialPeriod[]): DerivedMetrics {
  const ordered = [...prices].sort((left, right) => right.date.localeCompare(left.date));
  const close = (offset: number): number | undefined => ordered[offset]?.close;
  const returns = ordered.slice(0, 61).map((bar, index) => index > 0 && close(index) ? (bar.close / (close(index - 1) ?? bar.close) - 1) * 100 : undefined).filter((value): value is number => value !== undefined);
  const lastYear = ordered.slice(0, 252).map((bar) => bar.close);
  const high = lastYear.length ? Math.max(...lastYear) : undefined;
  const latest = close(0);
  const current = [...financials].sort((left, right) => right.periodEnd.localeCompare(left.periodEnd));
  const latestFinancial = current[0]; const previousFinancial = current[1];
  return {
    latestClose: latest,
    return20d: change(latest, close(20)), return60d: change(latest, close(60)), return120d: change(latest, close(120)),
    volatility60d: sampleStd(returns), drawdown52w: high && latest ? (latest / high - 1) * 100 : undefined,
    revenueGrowthYoY: change(latestFinancial?.revenue, previousFinancial?.revenue), netIncomeGrowthYoY: change(latestFinancial?.netIncome, previousFinancial?.netIncome),
    cashConversion: latestFinancial?.operatingCashFlow !== undefined && latestFinancial.netIncome !== undefined && latestFinancial.netIncome !== 0 ? latestFinancial.operatingCashFlow / latestFinancial.netIncome : undefined
  };
}
