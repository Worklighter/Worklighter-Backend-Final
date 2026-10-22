export interface PageSegment {
    text: string;
    pageIndices: number[];
}

class DocumentPageSegmenter {

    //* -------------------------------------------------------------------------- */
    //*                                  SEGMENT                                   */
    //* -------------------------------------------------------------------------- */
    public static segment(pages: string[]): PageSegment[] {
        if (pages.length === 0) return [];
        if (pages.length === 1) {
            const text = pages[0].trim();
            return text.length > 0 ? [{ text, pageIndices: [0] }] : [];
        }

        const groups: { pages: string[]; indices: number[] }[] = [{ pages: [pages[0]], indices: [0] }];

        for (let i = 1; i < pages.length; i++) {
            if (this.isContinuation(pages[i - 1], pages[i])) {
                groups[groups.length - 1].pages.push(pages[i]);
                groups[groups.length - 1].indices.push(i);
            } else {
                groups.push({ pages: [pages[i]], indices: [i] });
            }
        }

        return groups
            .map(g => ({ text: g.pages.join('\n\n').trim(), pageIndices: g.indices }))
            .filter(s => s.text.length > 0);
    }

    //* -------------------------------------------------------------------------- */
    //*                             IS CONTINUATION                                */
    //* -------------------------------------------------------------------------- */
    private static isContinuation(prev: string, curr: string): boolean {
        if (this.hasContinuationMarker(prev)) return true;
        if (curr.trim().length < 150) return true;

        const prevType = this.detectDocumentType(prev);
        const currType = this.detectDocumentType(curr);
        if (prevType !== null && currType !== null && prevType !== currType) return false;

        const prevIds = this.extractAllDocumentIds(prev);
        const currIds = this.extractAllDocumentIds(curr);

        if (prevIds.length > 0 && currIds.length > 0) return prevIds.some(id => currIds.includes(id));
        if (currIds.length === 0) return true;
        if (prevIds.length === 0 && currIds.length > 0) return false;

        return true;
    }

    //* -------------------------------------------------------------------------- */
    //*                          CONTINUATION MARKER                               */
    //* -------------------------------------------------------------------------- */
    private static hasContinuationMarker(text: string): boolean {
        return /\bcont(?:inued|['']?d)\b|\bto\s+be\s+continued\b/i.test(text);
    }

    //* -------------------------------------------------------------------------- */
    //*                          DETECT DOCUMENT TYPE                              */
    //* -------------------------------------------------------------------------- */
    private static detectDocumentType(text: string): string | null {
        const t = text.toLowerCase();

        const scores = {
            invoice:   [/\binvoice\b/, /\bbill\s+to\b/, /\binvoice\s*(?:no|number|#|:)/, /\bdue\s+date\b/, /\bremit\s+to\b/],
            daily_log: [/\bdaily\s+(?:log|report)\b/, /\bsuperintendent\b/, /\bwork\s+log\b/, /\bhours\s+worked\b/],
            coi:       [/\bcertificate\s+of\s+insurance\b/, /\binsurance\s+certificate\b/, /\bpolicy\s+(?:no|number)\b/, /\bcoi\b/, /\bgeneral\s+liability\b/, /\bworkers['']?\s+comp/],
        };

        const tally = (patterns: RegExp[]) => patterns.filter(r => r.test(t)).length;
        const results = Object.entries(scores).map(([type, patterns]) => ({ type, score: tally(patterns) }));
        const best = results.reduce((a, b) => b.score > a.score ? b : a);

        return best.score >= 1 ? best.type : null;
    }

    //* -------------------------------------------------------------------------- */
    //*                         EXTRACT ALL DOCUMENT IDS                           */
    //* -------------------------------------------------------------------------- */
    private static extractAllDocumentIds(text: string): string[] {
        const tag = (prefix: string, ids: string[]) => ids.map(id => `${prefix}:${id}`);
        return [
            ...tag('invoice',  this.extractInvoiceIds(text)),
            ...tag('dailylog', this.extractDailyLogIds(text)),
            ...tag('coi',      this.extractCOIIds(text)),
            ...tag('generic',  this.extractGenericIds(text)),
        ].filter((v, i, a) => a.indexOf(v) === i);
    }

    //* -------------------------------------------------------------------------- */
    //*                           EXTRACT INVOICE IDS                              */
    //* -------------------------------------------------------------------------- */
    private static extractInvoiceIds(text: string): string[] {
        const patterns = [
            /invoice\s*(?:no\.?|number|#|:)?\s*([A-Z0-9][A-Z0-9\-]{2,})/gi,
            /inv\.?\s*(?:no\.?|#|:)\s*([A-Z0-9][A-Z0-9\-]{2,})/gi,
            /bill\s*(?:no\.?|#|:)\s*([A-Z0-9][A-Z0-9\-]{2,})/gi,
        ];
        return [...new Set(patterns.flatMap(p => [...text.matchAll(p)].map(m => m[1].toUpperCase())))];
    }

    //* -------------------------------------------------------------------------- */
    //*                          EXTRACT DAILY LOG IDS                             */
    //* -------------------------------------------------------------------------- */
    private static extractDailyLogIds(text: string): string[] {
        const patterns = [
            /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/g,
            /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/gi,
        ];
        return [...new Set(patterns.flatMap(p => [...text.matchAll(p)].map(m => m[1].toLowerCase())))];
    }

    //* -------------------------------------------------------------------------- */
    //*                             EXTRACT COI IDS                                */
    //* -------------------------------------------------------------------------- */
    private static extractCOIIds(text: string): string[] {
        const patterns = [
            /(?:certificate|cert)\.?\s*(?:no\.?|number|#|:)\s*([A-Z0-9][A-Z0-9\-]{2,})/gi,
            /policy\s*(?:no\.?|number|#|:)\s*([A-Z0-9][A-Z0-9\-]{2,})/gi,
        ];
        return [...new Set(patterns.flatMap(p => [...text.matchAll(p)].map(m => m[1].toUpperCase())))];
    }

    //* -------------------------------------------------------------------------- */
    //*                           EXTRACT GENERIC IDS                              */
    //* -------------------------------------------------------------------------- */
    private static extractGenericIds(text: string): string[] {
        return [...new Set([...text.matchAll(/(?:no\.?|number|ref|id|#)\s*:?\s*([A-Z0-9][A-Z0-9\-]{3,})/gi)].map(m => m[1].toUpperCase()))];
    }
}

export default DocumentPageSegmenter;
