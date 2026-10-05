/**
 * Display format for point values: whole numbers stay integers ("12"),
 * anything else is rounded to 2 decimals ("12.35"). Avoids floating-point
 * noise like 0.1 + 0.2 leaking into the UI.
 */
export function formatPoints(value: number): string {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}
