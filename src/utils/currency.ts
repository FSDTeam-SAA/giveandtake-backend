/**
 * Website payments can be taken in a handful of local currencies so a web
 * buyer pays the same figure the App Store / Google Play show in their country
 * (e.g. £6.99 in the UK). USD stays the base: `plan.price` is always USD and a
 * plan only charges in another currency when it carries a `localPrices` entry.
 */
export const SUPPORTED_CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]
export const LOCAL_CURRENCIES = SUPPORTED_CURRENCIES.filter(
  (code) => code !== 'USD'
) as Exclude<SupportedCurrency, 'USD'>[]

export type LocalPrices = Partial<Record<Exclude<SupportedCurrency, 'USD'>, number>>

export const normalizeCurrency = (value: unknown): SupportedCurrency => {
  const code = String(value ?? '').trim().toUpperCase()
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code)
    ? (code as SupportedCurrency)
    : 'USD'
}

/**
 * The price a plan charges in the requested currency. Falls back to the USD
 * base price when the plan has no price for that currency, so callers must use
 * the returned currency rather than the requested one.
 */
export const resolvePlanPrice = (
  plan: { price: number; localPrices?: LocalPrices | null },
  requestedCurrency?: unknown
): { currency: SupportedCurrency; amount: number } => {
  const currency = normalizeCurrency(requestedCurrency)
  if (currency !== 'USD') {
    const local = Number(plan.localPrices?.[currency])
    if (Number.isFinite(local) && local > 0) return { currency, amount: local }
  }
  return { currency: 'USD', amount: Number(plan.price) }
}

/** Validates an admin-supplied `localPrices` object; returns undefined when absent. */
export const sanitizeLocalPrices = (input: unknown): LocalPrices | undefined => {
  if (input === undefined) return undefined
  if (input === null) return {}
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('localPrices must be an object such as { "GBP": 6.99 }')
  }
  const result: LocalPrices = {}
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const code = key.trim().toUpperCase()
    if (!(LOCAL_CURRENCIES as string[]).includes(code)) {
      throw new Error(`Unsupported currency in localPrices: ${key}`)
    }
    if (raw === null || raw === '') continue
    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`localPrices.${code} must be a positive number`)
    }
    result[code as keyof LocalPrices] = Math.round(amount * 100) / 100
  }
  return result
}

export const formatMoney = (amount: number, currency: string = 'USD') => {
  try {
    // en-US renders $6.99, £6.99, €7.99, CA$9.99, A$9.99.
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizeCurrency(currency),
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}
