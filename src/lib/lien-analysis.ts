/**
 * Analyzes the plaintiff name to determine lien position risk.
 * First mortgage foreclosures are typical. Second mortgage foreclosures are dangerous
 * because the winning bidder still owes the first mortgage.
 */

export interface LienAnalysis {
  position: 'first' | 'second' | 'unknown';
  risk: 'low' | 'medium' | 'high';
  reason: string;
}

// Major banks / servicers = almost always first mortgage
const FIRST_MORTGAGE_INDICATORS = [
  'wells fargo', 'bank of america', 'jpmorgan', 'chase', 'citibank', 'citi mortgage',
  'us bank', 'u.s. bank', 'pnc bank', 'pnc mortgage', 'truist', 'fifth third',
  'huntington', 'regions bank', 'key bank', 'keybank', 'bmo', 'td bank',
  'rocket mortgage', 'quicken loans', 'freedom mortgage', 'pennymac',
  'loancare', 'nationstar', 'mr. cooper', 'caliber home', 'newrez',
  'shellpoint', 'phh mortgage', 'ocwen', 'specialized loan', 'sls ',
  'federal national', 'fnma', 'fannie mae', 'freddie mac', 'fhlmc',
  'federal home loan', 'ginnie mae', 'gnma',
  'secretary of housing', 'hud', 'department of veterans',
  'iowa finance authority',
  'wilmington savings', 'wilmington trust', 'deutsche bank', 'hsbc',
  'bank of new york', 'us bank national', 'wells fargo bank',
  'lakeview loan', 'midland mortgage', 'bayview loan',
];

// HELOC lenders / second mortgage indicators
const SECOND_MORTGAGE_INDICATORS = [
  'heloc', 'home equity', 'equity line',
  'credit union', // CUs often do seconds/HELOCs
  'finance co', 'financial services',
  'consumer', 'personal loan',
];

// HOA / condo associations = definitely not first mortgage
const HOA_INDICATORS = [
  'homeowners association', 'hoa', 'condominium association', 'condo association',
  'property owners', 'community association',
];

// Tax / government liens
const TAX_INDICATORS = [
  'county treasurer', 'tax collector', 'internal revenue', 'irs',
  'state of iowa', 'department of revenue',
];

export function analyzeLienPosition(plaintiff: string): LienAnalysis {
  if (!plaintiff) {
    return { position: 'unknown', risk: 'medium', reason: 'No plaintiff information available' };
  }

  const lower = plaintiff.toLowerCase().trim();

  // Check for HOA - always dangerous, not a mortgage at all
  for (const indicator of HOA_INDICATORS) {
    if (lower.includes(indicator)) {
      return {
        position: 'unknown',
        risk: 'high',
        reason: `HOA/condo foreclosure (${plaintiff.substring(0, 40)}). First mortgage likely survives.`,
      };
    }
  }

  // Check for tax liens
  for (const indicator of TAX_INDICATORS) {
    if (lower.includes(indicator)) {
      return {
        position: 'unknown',
        risk: 'medium',
        reason: `Government/tax lien foreclosure. Research what other liens survive.`,
      };
    }
  }

  // Check for second mortgage indicators
  for (const indicator of SECOND_MORTGAGE_INDICATORS) {
    if (lower.includes(indicator)) {
      return {
        position: 'second',
        risk: 'high',
        reason: `Likely second mortgage/HELOC (${indicator}). First mortgage survives - verify total debt.`,
      };
    }
  }

  // Check for first mortgage indicators
  for (const indicator of FIRST_MORTGAGE_INDICATORS) {
    if (lower.includes(indicator)) {
      return {
        position: 'first',
        risk: 'low',
        reason: `Likely first mortgage (${plaintiff.substring(0, 40)}). Standard foreclosure.`,
      };
    }
  }

  // If it mentions "mortgage" generically, probably first
  if (lower.includes('mortgage')) {
    return {
      position: 'first',
      risk: 'low',
      reason: `Likely first mortgage lender. Verify if unfamiliar.`,
    };
  }

  // If it mentions "bank" generically, lean toward first
  if (lower.includes('bank') || lower.includes('savings')) {
    return {
      position: 'first',
      risk: 'low',
      reason: `Bank/savings institution - likely first mortgage. Verify if unfamiliar.`,
    };
  }

  return {
    position: 'unknown',
    risk: 'medium',
    reason: `Unknown plaintiff type (${plaintiff.substring(0, 40)}). Research lien position before bidding.`,
  };
}
