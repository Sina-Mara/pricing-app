# SPEC-021: Quote PDF Letterhead Redesign

**Status:** ready
**Created:** 2026-08-19

## Problem

`generateQuotePDF` (`src/lib/pdf.ts`) currently renders a generic, placeholder-branded PDF: "QUOTE" as a plain centered title, "Your Company Name / 123 Business Street" as literal placeholder text, a gray-striped table, and generic terms. Real quotes sent to customers (e.g. Telna, Bell Canada) should look like an official Cennso document, not a template default. A reference PDF from Cennso's ERP system (`Offer QT-2026-31205-10067`) shows the actual target look: logo + legal-entity letterhead, formal address block, right-aligned metadata, clean bordered table, bold totals, and a formal closing.

## Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Adopt Cennso's real legal letterhead: logo + "Cennso Technologies GmbH - Südstr. 6 - 39179 Barleben" + Geschäftsführung/Registrierung/Registernummer/UStID-Nr/Telefon/Mail block, matching the ERP reference's exact German labels | These are real quotes from the real legal entity; matching the ERP template's precedent (German labels are presumably required/conventional for German business-letter compliance even in an English-language letter) |
| D2 | Logo: `src/assets/cennso-logo.png` (the actual Cennso wordmark, supplied), embedded via `doc.addImage` | A real asset beats a text-rendered approximation |
| D3 | Keep the existing table columns (SKU/Description/Qty/Env/Discount/Unit Price/Monthly) — restyle only (bordered header, tighter spacing, formal typography), don't drop Env/Discount | Those columns carry real internal context useful to the rep's customer-facing conversation; only the visual treatment needed to change, not the content |
| D4 | Keep terms/signature section generic (payment terms, validity) — do NOT adopt the ERP reference's contract-penalty/VAT clauses, since those are specific to that LACS/PSA deal and don't generalize to every quote this app produces | Avoids baking one customer's specific contract terms into every exported quote |
| D5 | Right-aligned metadata block (Date / Quote Number / Status) and a "Firma"-style customer address block on the left, mirroring the reference's layout — but keep the current Bill-To customer fields (name/company/email/address) rather than the ERP's numeric "Kunde" ID, since this app doesn't have that concept | Structural/layout parity with the reference; content stays what this app actually has |
| D6 | Payment-cadence discount block (existing) and the new customer-specific discount block (SPEC-020, not yet in the PDF) both get the same restyled treatment, consistent with the new Contract Total section styling | The PDF should reflect the same discount data now shown in the app and Present view — this was simply never added to the PDF when SPEC-020 shipped |

## Guardrails

- **MUST NOT** hardcode deal-specific legal clauses (contract penalty %, PSA references) into the generic template
- **MUST** keep `generateQuotePDF`'s existing call signature compatible (or update the one call site in `QuoteBuilder.tsx` if it needs to become async for image loading)
- **MUST** show the customer-specific discount (SPEC-020) in the PDF if set, matching how it's now shown in-app and in Present view

## Acceptance

- [ ] PDF header shows the Cennso logo + legal entity block (address, Geschäftsführung, Registrierung, Registernummer, UStID-Nr, Telefon, Mail)
- [ ] Customer block and metadata (date, quote number, status, valid-until) are laid out left/right like the reference
- [ ] Table is restyled (bordered, formal typography) with the same columns as today
- [ ] Grand Total / Contract Total / Payment Discount / Customer Discount sections are visually consistent with the new style
- [ ] Terms section stays generic; no deal-specific legal text is hardcoded
- [ ] Closing matches formal tone ("Best regards, Cennso Technologies GmbH")
- [ ] Generated PDF verified visually (rendered and inspected) before considering this done

## Phases

1. **Asset** — `src/assets/cennso-logo.png` added (done)
2. **Rewrite `generateQuotePDF`** — letterhead, customer/metadata block, restyled table, totals/discounts sections, generic terms, closing
3. **Verify** — generate a real PDF from a live quote and visually inspect it
