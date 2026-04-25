/**
 * Iowa Redemption Period Calculator
 *
 * Iowa Code Chapter 628 governs redemption rights after sheriff sale:
 * - Standard: 1 year (365 days) for homestead properties
 * - Reduced: Can be reduced to 6 months if judgment >= 2/3 of appraised value
 *   and plaintiff files motion to reduce before sale
 * - Non-homestead / abandoned: 6 months
 * - If property is less than 10 acres, used as a home, and debtor hasn't
 *   abandoned it: full 1 year unless reduced
 *
 * During redemption, the owner can pay the bid amount + interest + costs to reclaim.
 * The buyer cannot take possession until redemption expires.
 */

export interface RedemptionInfo {
  standardExpiry: string;  // ISO date string
  reducedExpiry: string;   // ISO date string (6 months)
  daysRemaining: number;   // days until standard expiry
  daysRemainingReduced: number;
  isExpired: boolean;
  explanation: string;
}

export function calculateRedemption(saleDateStr: string): RedemptionInfo | null {
  if (!saleDateStr) return null;

  // Parse date - handles "2024-06-15T00:00:00" format
  const saleDate = new Date(saleDateStr);
  if (isNaN(saleDate.getTime())) return null;

  const now = new Date();

  // Standard: 1 year
  const standardExpiry = new Date(saleDate);
  standardExpiry.setFullYear(standardExpiry.getFullYear() + 1);

  // Reduced: 6 months
  const reducedExpiry = new Date(saleDate);
  reducedExpiry.setMonth(reducedExpiry.getMonth() + 6);

  const daysRemaining = Math.ceil(
    (standardExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysRemainingReduced = Math.ceil(
    (reducedExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  const isExpired = daysRemaining <= 0;

  let explanation: string;
  if (saleDate > now) {
    explanation = `Sale scheduled for ${saleDate.toLocaleDateString()}. ` +
      `Standard redemption would expire ${standardExpiry.toLocaleDateString()} (1 year). ` +
      `If reduced, ${reducedExpiry.toLocaleDateString()} (6 months).`;
  } else if (isExpired) {
    explanation = `Redemption period has expired. Sale was ${saleDate.toLocaleDateString()}.`;
  } else {
    explanation = `Standard redemption expires ${standardExpiry.toLocaleDateString()} (${daysRemaining} days). ` +
      `If reduced to 6 months: ${reducedExpiry.toLocaleDateString()} (${Math.max(0, daysRemainingReduced)} days). ` +
      `Owner can reclaim by paying bid + 2% interest + costs.`;
  }

  return {
    standardExpiry: standardExpiry.toISOString(),
    reducedExpiry: reducedExpiry.toISOString(),
    daysRemaining: Math.max(0, daysRemaining),
    daysRemainingReduced: Math.max(0, daysRemainingReduced),
    isExpired,
    explanation,
  };
}
