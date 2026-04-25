/**
 * Generate a printable property report.
 * Uses window.print() with a styled document — works in all browsers, no dependencies.
 */

function fmt$(val?: number | null): string {
  if (val == null) return '—';
  return '$' + val.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function generatePropertyReport(property: any, type: 'auction' | 'taxsale', aiAnalysis?: string) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const streetviewUrl = property.lat && property.lng && apiKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x250&location=${property.lat},${property.lng}&key=${apiKey}`
    : '';
  const mapUrl = property.lat && property.lng && apiKey
    ? `https://maps.googleapis.com/maps/api/staticmap?center=${property.lat},${property.lng}&zoom=15&size=600x250&maptype=roadmap&markers=color:red%7C${property.lat},${property.lng}&key=${apiKey}`
    : '';

  const addr = property.propertyAddress || property.legalDescription || property.parcelPin || 'Unknown';
  const date = new Date().toLocaleDateString();

  const sections: string[] = [];

  // Header
  sections.push(`
    <div class="header">
      <h1>${addr}</h1>
      <div class="subtitle">Polk County Investor — Property Report · ${date}</div>
      <div class="badge">${type === 'auction' ? 'Sheriff Auction' : 'Tax Sale Certificate'}</div>
    </div>
  `);

  // Images
  if (streetviewUrl || mapUrl) {
    sections.push(`
      <div class="images">
        ${streetviewUrl ? `<img src="${streetviewUrl}" alt="Street View">` : ''}
        ${mapUrl ? `<img src="${mapUrl}" alt="Map">` : ''}
      </div>
    `);
  }

  // Financial Summary
  if (type === 'auction') {
    sections.push(`
      <div class="section">
        <h2>Financial Summary</h2>
        <table><tbody>
          <tr><td>Judgment Amount</td><td><strong>${property.approxJudgment || '—'}</strong></td></tr>
          <tr><td>Assessed Value</td><td>${fmt$(property.assessedValue)}</td></tr>
          <tr><td>Land / Building</td><td>${fmt$(property.landValue)} / ${fmt$(property.buildingValue)}</td></tr>
          <tr><td>Outstanding Taxes</td><td>${fmt$(property.outstandingTaxes)}</td></tr>
          <tr><td>Equity Estimate</td><td>${fmt$(property.equity)}</td></tr>
          <tr><td>Last Sale</td><td>${fmt$(property.lastSaleAmount)} ${property.lastSaleDate ? `(${property.lastSaleDate})` : ''}</td></tr>
          <tr><td>Sale Date</td><td>${property.salesDate || '—'}</td></tr>
          <tr><td>Plaintiff</td><td>${property.plaintiff || '—'}</td></tr>
          <tr><td>Defendant</td><td>${property.defendant || '—'}</td></tr>
          <tr><td>Parcel PIN</td><td>${property.parcelPin || '—'}</td></tr>
        </tbody></table>
      </div>
    `);
  } else {
    sections.push(`
      <div class="section">
        <h2>Tax Sale Certificate Details</h2>
        <table><tbody>
          <tr><td>Total Due</td><td><strong style="color:#c53030">${fmt$(property.totalDue)}</strong></td></tr>
          <tr><td>Interest Rate</td><td>2% / month (24%/yr)</td></tr>
          <tr><td>Tax + Interest</td><td>${fmt$(property.taxInterest)}</td></tr>
          <tr><td>Late Interest</td><td>${fmt$(property.lateInterest)}</td></tr>
          <tr><td>Fees</td><td>${fmt$(property.totalFee)}</td></tr>
          <tr><td>Sale Type</td><td>${property.saleTypeLabel || '—'}</td></tr>
          <tr><td>Area</td><td>${property.area || '—'}</td></tr>
          <tr><td>Property Type</td><td>${property.propertyType || '—'}</td></tr>
          <tr><td>Owner</td><td>${property.titleHolder || '—'}</td></tr>
          <tr><td>Parcel PIN</td><td>${property.parcelPin || '—'}</td></tr>
          <tr><td>Assessed Value</td><td>${fmt$(property.assessedValue)}</td></tr>
        </tbody></table>
      </div>
    `);
  }

  // Property Details
  if (property.assessedValue) {
    sections.push(`
      <div class="section">
        <h2>Property Details</h2>
        <table><tbody>
          <tr><td>Class</td><td>${property.propertyClass || '—'}</td></tr>
          <tr><td>Year Built</td><td>${property.yearBuilt || '—'}</td></tr>
          <tr><td>Sqft</td><td>${property.sqft ? property.sqft.toLocaleString() : '—'}</td></tr>
          <tr><td>Bedrooms</td><td>${property.bedrooms || '—'}</td></tr>
          <tr><td>Bathrooms</td><td>${property.bathrooms || '—'}</td></tr>
        </tbody></table>
      </div>
    `);
  }

  // Sale History
  if (property.saleHistory?.length) {
    sections.push(`
      <div class="section">
        <h2>Sale History (${property.saleHistory.length} Records)</h2>
        <table>
          <thead><tr><th>Date</th><th>Seller</th><th>Buyer</th><th>Price</th><th>Type</th></tr></thead>
          <tbody>
            ${property.saleHistory.slice(0, 15).map((s: any) => `
              <tr><td>${s.date}</td><td>${s.seller}</td><td>${s.buyer}</td><td>${fmt$(s.price)}</td><td>${s.instrument}</td></tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `);
  }

  // Flood / Environmental / Wetlands
  const riskItems: string[] = [];
  if (property.floodZone) riskItems.push(`<tr><td>Flood Zone</td><td>${property.floodZone} ${property.isFloodZone ? '(HIGH RISK)' : '(Minimal)'}</td></tr>`);
  if (property.envRiskLevel) riskItems.push(`<tr><td>Environmental</td><td>${property.envSummary || property.envRiskLevel}</td></tr>`);
  if (property.envSuperfundNearby) riskItems.push(`<tr><td>Superfund Sites</td><td>${property.envSuperfundCount} nearby</td></tr>`);
  if (property.envTriCount) riskItems.push(`<tr><td>TRI Facilities</td><td>${property.envTriCount} nearby</td></tr>`);
  if (property.onWetland) riskItems.push(`<tr><td>Wetlands</td><td>${property.wetlandDescription}</td></tr>`);
  if (property.specialAssessmentTotal) riskItems.push(`<tr><td>Special Assessments</td><td>${fmt$(property.specialAssessmentTotal)} owed</td></tr>`);
  if (property.hasUnredeemedTaxSale) riskItems.push(`<tr><td>Tax Sale Cert</td><td>${fmt$(property.taxSaleAmount)} (Cert #${property.taxSaleCertNumber})</td></tr>`);

  if (riskItems.length) {
    sections.push(`
      <div class="section">
        <h2>Risk Factors</h2>
        <table><tbody>${riskItems.join('')}</tbody></table>
      </div>
    `);
  }

  // Neighborhood
  if (property.medianHouseholdIncome) {
    sections.push(`
      <div class="section">
        <h2>Neighborhood</h2>
        <table><tbody>
          <tr><td>Median Income</td><td>${fmt$(property.medianHouseholdIncome)}</td></tr>
          <tr><td>Median Home Value</td><td>${fmt$(property.medianHomeValue)}</td></tr>
          <tr><td>Median Rent</td><td>${fmt$(property.medianGrossRent)}</td></tr>
          <tr><td>Owner Occupied</td><td>${property.ownerOccupiedPct ?? '—'}%</td></tr>
          ${property.hudRent2Bed ? `<tr><td>HUD FMR 2-Bed</td><td>${fmt$(property.hudRent2Bed)}/mo</td></tr>` : ''}
          ${property.hudRent3Bed ? `<tr><td>HUD FMR 3-Bed</td><td>${fmt$(property.hudRent3Bed)}/mo</td></tr>` : ''}
        </tbody></table>
      </div>
    `);
  }

  // Open print window
  const win = window.open('', '_blank');
  if (!win) return;

  win.document.write(`<!DOCTYPE html><html><head>
    <title>Property Report — ${addr}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; color: #1a1d26; padding: 24px; max-width: 800px; margin: 0 auto; }
      .header { margin-bottom: 20px; border-bottom: 2px solid #c8860a; padding-bottom: 12px; }
      .header h1 { font-size: 20px; color: #1a1d26; margin-bottom: 4px; }
      .header .subtitle { font-size: 11px; color: #666; margin-bottom: 6px; }
      .header .badge { display: inline-block; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; padding: 2px 8px; border: 1px solid #c8860a; color: #c8860a; border-radius: 4px; }
      .images { display: flex; gap: 8px; margin-bottom: 16px; }
      .images img { flex: 1; height: 200px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd; }
      .section { margin-bottom: 16px; page-break-inside: avoid; }
      .section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #c8860a; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; padding: 4px 8px; border-bottom: 1px solid #eee; }
      td { padding: 4px 8px; border-bottom: 1px solid #f5f5f5; font-size: 11px; }
      td:first-child { color: #666; width: 40%; }
      td:last-child { font-weight: 500; }
      strong { color: #1a1d26; }
      .ai-section { border-left: 3px solid #c8860a; padding-left: 12px; margin-top: 8px; }
      .ai-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #c8860a; margin: 10px 0 4px; }
      .ai-section h3:first-child { margin-top: 0; }
      .ai-section p { margin: 3px 0; font-size: 11px; line-height: 1.6; }
      @media print { body { padding: 0; } .images img { height: 180px; } }
    </style>
  </head><body>
    ${sections.join('\n')}
    ${aiAnalysis ? `
      <div class="section" style="page-break-before: auto;">
        <h2>AI Investment Analysis</h2>
        <div class="ai-section">
          ${aiAnalysis.split('\n').map(line => {
            if (line.match(/^\*\*.*\*\*$/)) return `<h3>${line.replace(/\*\*/g, '')}</h3>`;
            if (line.match(/^\*\*.*\*\*/)) return `<p>${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`;
            if (line.startsWith('- ') || line.startsWith('* ')) return `<p style="padding-left:12px">• ${line.replace(/^[-*]\s*/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`;
            if (line.trim() === '') return '';
            return `<p>${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`;
          }).join('\n')}
        </div>
      </div>
    ` : ''}
    <div style="margin-top: 24px; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px;">
      Generated by Polk County Investor · ${date} · Data from public sources — verify before making investment decisions.${aiAnalysis ? ' AI analysis is for informational purposes only.' : ''}
    </div>
  </body></html>`);
  win.document.close();

  // Wait for images to load then print
  setTimeout(() => { win.print(); }, 1500);
}
