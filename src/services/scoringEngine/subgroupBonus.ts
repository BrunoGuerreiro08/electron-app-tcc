export function computeSubgroupBonus(
    total: number,
    minPoints: number | null,
    bonusRate: number | null
): number | null {
    if (minPoints == null || bonusRate == null) return null

    const surplus = total - minPoints
    return surplus > 0 ? surplus * bonusRate : 0
}