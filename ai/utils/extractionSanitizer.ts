
//* -------------------------------------------------------------------------- */
//*                        EXTRACTION FIELD SANITIZER                          */
//* -------------------------------------------------------------------------- */
//* Deterministic post-processing applied to LLM-extracted field values AFTER
//* the graph runs but BEFORE validation, scoring, and storage.
//*
//* Why this exists:
//*   Azure Document Intelligence and pdf-parse both introduce OCR artifacts
//*   where a single token gets split across a line-break in the source PDF.
//*   The LLM faithfully copies what it receives, producing values like:
//*     "CER T-804150"   instead of  "CERT-804150"
//*     "XYZ Con struction"  instead of  "XYZ Construction"
//*
//*   These are not LLM hallucinations — they are OCR line-break artifacts.
//*   Re-prompting cannot fix them because the LLM never saw the correct form.
//*   A deterministic normalizer applied post-extraction is the right fix.


//* Collapses OCR-induced mid-token spaces in alphanumeric identifier strings.
//* Applies to: certificate numbers, policy numbers, invoice numbers, vendor names.
//*
//* Rule: if a space appears between two non-space characters where neither side
//* is a complete English dictionary word (i.e. it looks like a broken identifier),
//* collapse the space. We detect this by checking if the space is surrounded by
//* alphanumeric chars with no surrounding context that suggests intentional spacing
//* (e.g. between a letter and a digit/dash, or a digit and a letter — typical of
//* broken code tokens like "CER T-804150", "INV 2025-001", "XYZ- 99").
function collapseOcrSpacesInIdentifier(value: string): string {
    if (!value) return value;

    //* Pattern: letter(s) + space + letter/digit where the space is clearly
    //* a broken token, not a word boundary. Heuristic: if the left side is
    //* 1–4 chars (too short to be a real word) and is followed by a space
    //* then more alphanumeric chars, collapse it.
    //* Also collapses: digit + space + letter/digit (e.g. "804 150" → "804150")
    //* and letter + space + digit (e.g. "CER T" → "CERT", "INV 001" → "INV001").
    return value
        .replace(/([A-Za-z]{1,4})\s+([A-Za-z0-9\-])/g, (match, left, right) => {
            //* Don't collapse if left side looks like a real English word (5+ chars)
            //* or if the pattern looks like intentional multi-word (all-lowercase words).
            if (left.length >= 5 && /^[a-z]+$/.test(left)) return match;
            return left + right;
        })
        .replace(/([0-9])\s+([A-Za-z0-9])/g, '$1$2')  // digit + space + alphanum → collapse
        .trim();
}


//* Normalizes a string field: trims, collapses internal runs of whitespace,
//* and applies the OCR identifier repair for code-like values.
function normalizeStringField(value: string | null | undefined, isIdentifier = false): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed) return null;
    return isIdentifier ? collapseOcrSpacesInIdentifier(trimmed) : trimmed;
}


//* -------------------------------------------------------------------------- */
//*                         DOCUMENT-TYPE SANITIZERS                           */
//* -------------------------------------------------------------------------- */

//* -------------------------------------------------------------------------- */
//*                      COMPLIANCE STATUS CLASSIFIER                          */
//* -------------------------------------------------------------------------- */
//* Single source of truth for deriving compliance document status from an
//* expiration date string.
//*
//* Rules (evaluated in priority order):
//*   1. null / unparseable date            → compliant  (don't block on bad data)
//*   2. expiry ≤ today (UTC midnight)      → expired  (same-day expiry = expired)
//*   3. expiry ≤ today + EXPIRING_SOON_DAYS → expiring_soon
//*   4. otherwise                          → compliant
//*
//* Returns both the emailStatus label (for the submission record) and the
//* boolean isExpired flag (stored inside aiAnalysisReport).

import { COMPLIANCE_ALERT_THRESHOLDS } from '../../utils/constants';
import StatusTypes from '../../core/enums/statusTypes';

export interface IComplianceStatusResult {
    emailStatus: StatusTypes.EXPIRED | StatusTypes.EXPIRING_SOON | StatusTypes.COMPLIANT;
    isExpired: boolean;
    isExpiringSoon: boolean;
    isCompliant: boolean;
}

export function computeComplianceStatus(expirationDate: string | null | undefined): IComplianceStatusResult {
    if (!expirationDate) {
        return { emailStatus: StatusTypes.COMPLIANT, isExpired: false, isExpiringSoon: false, isCompliant: true };
    }

    const expiry = new Date(expirationDate);
    if (isNaN(expiry.getTime())) {
        return { emailStatus: StatusTypes.COMPLIANT, isExpired: false, isExpiringSoon: false, isCompliant: true };
    }

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);

    if (expiry <= todayUtc) {
        return { emailStatus: StatusTypes.EXPIRED, isExpired: true, isExpiringSoon: false, isCompliant: false };
    }

    const thresholdUtc = new Date(todayUtc);
    thresholdUtc.setUTCDate(thresholdUtc.getUTCDate() + COMPLIANCE_ALERT_THRESHOLDS.EXPIRING_SOON_DAYS);

    if (expiry <= thresholdUtc) {
        return { emailStatus: StatusTypes.EXPIRING_SOON, isExpired: false, isExpiringSoon: true, isCompliant: false };
    }

    return { emailStatus: StatusTypes.COMPLIANT, isExpired: false, isExpiringSoon: false, isCompliant: true };
}

//* Kept for backwards compatibility — delegates to computeComplianceStatus.
export function computeIsExpired(expirationDate: string | null | undefined): boolean {
    return computeComplianceStatus(expirationDate).isExpired;
}


export function sanitizeComplianceExtraction(data: any): any {
    if (!data) return data;

    //* policyNumber is now string[] | null — sanitize each entry individually
    let policyNumber: string[] | null = null;
    if (Array.isArray(data.policyNumber)) {
        const cleaned = data.policyNumber
            .map((p: any) => normalizeStringField(String(p), true))
            .filter((p: string | null): p is string => p !== null && p.trim() !== '');
        policyNumber = cleaned.length > 0 ? cleaned : null;
    }

    return {
        ...data,
        vendor:         normalizeStringField(data.vendor),
        certificate:    normalizeStringField(data.certificate, true),
        documentType:   normalizeStringField(data.documentType),
        insurer:        normalizeStringField(data.insurer),
        policyNumber,
        effectiveDate:  normalizeStringField(data.effectiveDate),
        expirationDate: normalizeStringField(data.expirationDate),
        coverage: Array.isArray(data.coverage)
            ? data.coverage
                .map((item: any) => ({
                    coveredProperty:    normalizeStringField(item?.coveredProperty) ?? '',
                    amountOfInsurance:  normalizeStringField(item?.amountOfInsurance) ?? '',
                }))
                .filter((item: any) => item.coveredProperty || item.amountOfInsurance)
            : null,
    };
}

export function sanitizeInvoiceExtraction(data: any): any {
    if (!data) return data;
    return {
        ...data,
        vendor:        normalizeStringField(data.vendor),
        invoiceNumber: normalizeStringField(data.invoiceNumber, true),  // identifier — collapse OCR spaces
        invoiceDate:   normalizeStringField(data.invoiceDate),
        invoiceDueDate: normalizeStringField(data.invoiceDueDate),
        currency:      normalizeStringField(data.currency),
        job:           normalizeStringField(data.job),
        notes:         normalizeStringField(data.notes),
        lineItems: Array.isArray(data.lineItems)
            ? data.lineItems.map((item: any) => ({
                ...item,
                itemName:       normalizeStringField(item.itemName),
                mappedCostCode: normalizeStringField(item.mappedCostCode, true),
                currency:       normalizeStringField(item.currency),
            }))
            : data.lineItems,
    };
}

export function sanitizeDailyLogExtraction(data: any): any {
    if (!data) return data;
    return {
        ...data,
        superintendent: normalizeStringField(data.superintendent),
        job:            normalizeStringField(data.job),
        equipment:      normalizeStringField(data.equipment),
        tasks: Array.isArray(data.tasks)
            ? data.tasks.map((task: any) => ({
                ...task,
                taskName:       normalizeStringField(task.taskName),
                mappedCostCode: normalizeStringField(task.mappedCostCode, true),
            }))
            : data.tasks,
        crew: Array.isArray(data.crew)
            ? data.crew.map((member: any) => ({
                ...member,
                name:  normalizeStringField(member.name),
                trade: normalizeStringField(member.trade),
                //* rawHours must NOT be normalised — the calculator needs the original string
            }))
            : [],
    };
}
