import { PDFDocument } from 'pdf-lib';


class PdfSplitter {

    //* -------------------------------------------------------------------------- */
    //*                          EXTRACT PAGES METHOD                              */
    //* -------------------------------------------------------------------------- */
    /**
     * Extracts a subset of pages from a PDF buffer and returns a new PDF buffer.
     *
     * @param pdfBuffer   - The original PDF file buffer
     * @param pageIndices - 0-based indices of the pages to include in the output PDF
     * @returns           - A new Buffer containing only the specified pages, or null on failure
     */
    public static async extractPages(pdfBuffer: Buffer, pageIndices: number[]): Promise<Buffer | null> {
        try {
            const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
            const totalPages = srcDoc.getPageCount();

            //* Filter out any indices that are out of bounds
            const validIndices = pageIndices.filter(i => i >= 0 && i < totalPages);
            if (validIndices.length === 0) {
                return null;
            }

            const newDoc = await PDFDocument.create();
            const copiedPages = await newDoc.copyPages(srcDoc, validIndices);
            copiedPages.forEach(page => newDoc.addPage(page));

            const bytes = await newDoc.save();
            return Buffer.from(bytes);
        } catch (error: any) {
            //* Graceful failure — encrypted or corrupt PDFs fall back to the original URL
            console.warn(`   ⚠️  PdfSplitter: failed to extract pages [${pageIndices.join(', ')}] — ${error.message}`);
            return null;
        }
    }

}

export default PdfSplitter;
