export interface SherifffListing {
  propertyId: string;
  referenceNumber: string;
  salesDate: string;
  plaintiff: string;
  defendant: string;
  propertyAddress: string;
  isDelayed: boolean;
  // Enriched client-side
  lat?: number;
  lng?: number;
  approxJudgment?: string;
  parcelPin?: string;
  // Assessor / tax data
  assessedValue?: number;
  lastSaleAmount?: number;
  lastSaleDate?: string;
  saleHistory?: SaleHistoryEntry[];
  outstandingTaxes?: number;
  taxYear?: string;
  taxDelinquentYears?: string[];
  taxSaleAmount?: number;
  taxSaleCertNumber?: string;
  taxSaleYear?: number;
  hasUnredeemedTaxSale?: boolean;
  taxInstallments?: TaxInstallmentSummary[];
  payOnlineUrl?: string;
  propertyClass?: string;
  yearBuilt?: string;
  sqft?: number;
  acres?: number;
  bedrooms?: number;
  bathrooms?: number;
  // Calculated
  equity?: number; // assessedValue - judgmentNumeric
  // Flood data (FEMA)
  floodZone?: string;
  isFloodZone?: boolean;
  floodDescription?: string;
  // Census / neighborhood
  medianHouseholdIncome?: number;
  medianHomeValue?: number;
  medianGrossRent?: number;
  ownerOccupiedPct?: number;
  // HUD rent
  hudRent2Bed?: number;
  hudRent3Bed?: number;
  // Rentcast estimates
  rentcastRentEstimate?: number;
  rentcastRentLow?: number;
  rentcastRentHigh?: number;
  rentcastValueEstimate?: number;
  rentcastValueLow?: number;
  rentcastValueHigh?: number;
  rentcastRentComps?: RentcastComp[];
  rentcastValueComps?: RentcastComp[];
  rentcastFetchedAt?: string;
  // Special Assessments
  specialAssessments?: { year: number; project: string; totalDue: number }[];
  specialAssessmentTotal?: number;
  // Environmental
  envRiskLevel?: 'low' | 'medium' | 'high';
  envSummary?: string;
  envEchoCount?: number;
  envHasViolations?: boolean;
  envTotalPenalties?: number;
  envSuperfundNearby?: boolean;
  envSuperfundCount?: number;
  envTriCount?: number;
  // Wetlands
  onWetland?: boolean;
  wetlandCount?: number;
  wetlandDescription?: string;
  // Enrichment tracking
  enrichedAt?: string;
}

export interface RentcastComp {
  address: string;
  rent?: number;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  distance?: number;
  saleDate?: string;
  propertyType?: string;
}

export interface SaleHistoryEntry {
  seller: string;
  buyer: string;
  date: string;
  price: number;
  instrument: string;
}

export interface TaxInstallmentSummary {
  year: number;
  installmentNum: number;
  totalDue: number;
  originalTotal: number;
  soldAtTaxSale: boolean;
}

export interface ParcelResult {
  PIN: string;
  AlternatePIN: string;
  TitleHolder1: string;
  TitleHolder2: string;
  PropertyAddress: string;
}

export interface GeocoderResponse {
  status: string;
  error_message?: string;
  results: {
    geometry: {
      location: { lat: number; lng: number };
    };
    formatted_address: string;
  }[];
}

export interface CachedData {
  listings: SherifffListing[];
  fetchedAt: string; // ISO date
  version: number;
}
