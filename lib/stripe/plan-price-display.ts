/** Formats a monthly USD amount from the static catalog using the request locale. */
export function formatStaticUsdMonthlyLabel(
  amountMonthly: number,
  locale: string,
  monthSuffix: string,
) {
  const amount = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountMonthly);
  return `${amount}${monthSuffix}`;
}
