import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export enum ProcessingMethod {
    AZURE_DOCUMENT_INTELLIGENCE = 'azure_document_intelligence',
    DIRECT_TEXT_EXTRACTION = 'direct_text_extraction'
}

export interface AttachmentAnalysisResult {
    method: ProcessingMethod;
    reason: string;
    extractedText?: string;
    pages?: string[];
    fallbackPages?: string[];  // pdf-parse per-page text, used for hybrid PDF merging with Azure DI output
}

class AttachmentAnalyzer {
    private static instance: AttachmentAnalyzer;

    private constructor() { }

    public static getInstance(): AttachmentAnalyzer {
        if (!AttachmentAnalyzer.instance) {
            AttachmentAnalyzer.instance = new AttachmentAnalyzer();
        }
        return AttachmentAnalyzer.instance;
    }

    //* -------------------------------------------------------------------------- */
    //*                         ANALYZE ATTACHMENT METHOD                          */
    //* -------------------------------------------------------------------------- */
    public async analyzeAttachment(file: Express.Multer.File): Promise<AttachmentAnalysisResult> {
        const mimeType = file.mimetype.toLowerCase();
        const fileName = file.originalname.toLowerCase();

        console.log(`\n🔍 Analyzing attachment: ${file.originalname}`);
        console.log(`   MIME type: ${mimeType}`);

        // Check if it's an image - always use Azure Document Intelligence
        if (this.isImage(mimeType, fileName)) {
            console.log('   ✅ Image detected → Using Azure Document Intelligence');
            return {
                method: ProcessingMethod.AZURE_DOCUMENT_INTELLIGENCE,
                reason: 'Image file requires OCR processing'
            };
        }

        // Check if it's a PDF
        if (this.isPDF(mimeType, fileName)) {
            console.log('   📄 PDF detected → Checking if text-extractable...');
            const textExtractionResult = await this.tryExtractTextFromPDF(file.buffer);

            if (textExtractionResult.success && textExtractionResult.text && textExtractionResult.text.trim().length > 50) {
                const pages = textExtractionResult.pages ?? [];

                //* Hybrid PDF guard: if any page in a multi-page PDF has no extractable text,
                //* the document contains scanned pages — route the whole thing to Azure DI
                //* so all pages are extracted consistently via OCR.
                const hasEmptyPages = pages.length > 1 && pages.some(p => p.trim().length < 20);
                if (hasEmptyPages) {
                    const emptyCount = pages.filter(p => p.trim().length < 20).length;
                    console.log(`   ⚠️  Hybrid PDF detected — ${emptyCount}/${pages.length} page(s) have no extractable text → Using Azure Document Intelligence`);
                    return {
                        method: ProcessingMethod.AZURE_DOCUMENT_INTELLIGENCE,
                        reason: `Hybrid PDF: ${emptyCount} of ${pages.length} pages are scanned and require OCR`,
                        fallbackPages: pages,
                    };
                }

                //* Table-layout coherence guard: multi-column table PDFs (construction logs,
                //* forms, spreadsheet exports) are read by pdf-parse column-strip by column-strip,
                //* producing garbled text where column headers and values from different rows are
                //* concatenated. The resulting text looks character-rich but is semantically unusable.
                //* Detect this by measuring text coherence — garbled column dumps have short average
                //* word length, high repetition, and a low ratio of alphabetic content to total chars.
                const coherenceResult = this.assessTextCoherence(textExtractionResult.text, pages);
                if (!coherenceResult.isCoherent) {
                    console.log(`   ⚠️  Incoherent text detected (${coherenceResult.reason}) → Using Azure Document Intelligence`);
                    return {
                        method: ProcessingMethod.AZURE_DOCUMENT_INTELLIGENCE,
                        reason: `PDF text is structurally garbled: ${coherenceResult.reason}`,
                        fallbackPages: pages,
                    };
                }

                console.log(`   ✅ Text-based PDF (${textExtractionResult.text.length} chars) → Direct extraction`);
                return {
                    method: ProcessingMethod.DIRECT_TEXT_EXTRACTION,
                    reason: 'Text-based PDF with extractable content',
                    extractedText: textExtractionResult.text,
                    pages,
                };
            } else {
                console.log('   ⚠️  Scanned/Low-text PDF → Using Azure Document Intelligence');
                return {
                    method: ProcessingMethod.AZURE_DOCUMENT_INTELLIGENCE,
                    reason: 'Scanned PDF or insufficient extractable text'
                };
            }
        }

        // Check if it's a Word document
        if (this.isWordDocument(mimeType, fileName)) {
            console.log('   📝 Word document detected → Extracting text...');
            const textExtractionResult = await this.tryExtractTextFromDocx(file.buffer);

            if (textExtractionResult.success && textExtractionResult.text) {
                console.log(`   ✅ Text extracted (${textExtractionResult.text.length} chars) → Direct extraction`);
                return {
                    method: ProcessingMethod.DIRECT_TEXT_EXTRACTION,
                    reason: 'Word document with extractable content',
                    extractedText: textExtractionResult.text
                };
            } else {
                console.log('   ⚠️  Failed to extract text → Using Azure Document Intelligence');
                return {
                    method: ProcessingMethod.AZURE_DOCUMENT_INTELLIGENCE,
                    reason: 'Word document text extraction failed'
                };
            }
        }

        // Check if it's a plain text file
        if (this.isTextFile(mimeType, fileName)) {
            console.log('   📃 Text file detected → Direct extraction');
            const text = file.buffer.toString('utf-8');
            return {
                method: ProcessingMethod.DIRECT_TEXT_EXTRACTION,
                reason: 'Plain text file',
                extractedText: text
            };
        }

        // Default fallback to Azure Document Intelligence
        console.log('   ❓ Unknown format → Using Azure Document Intelligence');
        return {
            method: ProcessingMethod.AZURE_DOCUMENT_INTELLIGENCE,
            reason: `Unknown or unsupported format: ${mimeType}`
        };
    }

    //* -------------------------------------------------------------------------- */
    //*                            CHECK IF IMAGE METHOD                           */
    //* -------------------------------------------------------------------------- */
    private isImage(mimeType: string, fileName: string): boolean {
        const imageMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff'];
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif'];

        return imageMimeTypes.includes(mimeType) || imageExtensions.some(ext => fileName.endsWith(ext));
    }

    //* -------------------------------------------------------------------------- */
    //*                             CHECK IF PDF METHOD                            */
    //* -------------------------------------------------------------------------- */
    private isPDF(mimeType: string, fileName: string): boolean {
        return mimeType === 'application/pdf' || fileName.endsWith('.pdf');
    }

    //* -------------------------------------------------------------------------- */
    //*                       CHECK IF WORD DOCUMENT METHOD                        */
    //* -------------------------------------------------------------------------- */
    private isWordDocument(mimeType: string, fileName: string): boolean {
        const wordMimeTypes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ];
        const wordExtensions = ['.docx', '.doc'];

        return wordMimeTypes.includes(mimeType) || wordExtensions.some(ext => fileName.endsWith(ext));
    }

    //* -------------------------------------------------------------------------- */
    //*                        CHECK IF TEXT FILE METHOD                           */
    //* -------------------------------------------------------------------------- */
    private isTextFile(mimeType: string, fileName: string): boolean {
        const textMimeTypes = ['text/plain', 'text/html', 'text/csv', 'application/json'];
        const textExtensions = ['.txt', '.csv', '.json', '.html', '.htm'];

        return textMimeTypes.includes(mimeType) || textExtensions.some(ext => fileName.endsWith(ext));
    }

    //* -------------------------------------------------------------------------- */
    //*                       TRY EXTRACT TEXT FROM PDF METHOD                     */
    //* -------------------------------------------------------------------------- */
    //*                        TEXT COHERENCE ASSESSMENT                          */
    //* -------------------------------------------------------------------------- */
    //* Multi-column table PDFs (daily logs, forms, construction reports) are read
    //* by pdf-parse column-by-column, producing text that looks character-rich but
    //* is semantically garbled: column headers and values from unrelated rows get
    //* concatenated into a single stream. Three signals reliably detect this:
    //*
    //*   1. avgWordLength < 4.5 — garbled column dumps consist of short labels,
    //*      abbreviations, and numbers. Coherent prose averages 5+ chars per word.
    //*
    //*   2. uniqueWordRatio < 0.35 — table headers repeat across pages (Type, Name,
    //*      Status, Hours) creating high repetition. Prose has higher lexical variety.
    //*
    //*   3. alphaRatio < 0.40 — garbled table text is dense with numbers, symbols
    //*      (Ɵ, Ʃ, Ā), and punctuation. Prose is predominantly alphabetic.
    //*
    //* Any two of three signals failing routes to Azure DI.
    //* Exposed as public so the job processor can apply the same check to individual
    //* fallback pages during the hybrid merge, preventing garbled column-strips from
    //* being recovered as meaningful page content.
    public isPageCoherent(pageText: string): boolean {
        return this.assessTextCoherence(pageText, []).isCoherent;
    }

    private assessTextCoherence(
        text: string,
        pages: string[],
    ): { isCoherent: boolean; reason?: string } {
        const words = text.split(/\s+/).filter(w => w.length > 0);
        if (words.length < 15) {
            return { isCoherent: false, reason: 'too few words to assess structure' };
        }

        //* Signal 1 — average word length
        const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;

        //* Signal 2 — unique word ratio (low = high repetition = table headers cycling)
        const uniqueWords = new Set(words.map(w => w.toLowerCase()));
        const uniqueWordRatio = uniqueWords.size / words.length;

        //* Signal 3 — alphabetic character ratio (low = number/symbol heavy = table data columns)
        const alphaChars = (text.match(/[a-zA-Z]/g) ?? []).length;
        const alphaRatio = alphaChars / text.replace(/\s/g, '').length;

        //* Signal 4 — page content balance: if pages have wildly different char counts,
        //* it suggests columns were read as separate streams (one column per page slice)
        //* rather than rows. Flag if the smallest page is < 15% of the largest.
        let hasImbalancedPages = false;
        if (pages.length > 1) {
            const pageLengths = pages.map(p => p.trim().length).filter(l => l > 0);
            if (pageLengths.length > 1) {
                const minLen = Math.min(...pageLengths);
                const maxLen = Math.max(...pageLengths);
                hasImbalancedPages = maxLen > 0 && (minLen / maxLen) < 0.15;
            }
        }

        const failures: string[] = [];
        if (avgWordLength < 4.5)    failures.push(`avg word length ${avgWordLength.toFixed(1)} < 4.5`);
        if (uniqueWordRatio < 0.35) failures.push(`unique word ratio ${uniqueWordRatio.toFixed(2)} < 0.35`);
        if (alphaRatio < 0.40)      failures.push(`alpha char ratio ${alphaRatio.toFixed(2)} < 0.40`);
        if (hasImbalancedPages)     failures.push('page content severely imbalanced (column-strip reading pattern)');

        //* Incoherent if 2+ signals fail — single signal could be a legitimate terse doc
        if (failures.length >= 2) {
            return { isCoherent: false, reason: failures.join('; ') };
        }

        return { isCoherent: true };
    }

    //* -------------------------------------------------------------------------- */
    private async tryExtractTextFromPDF(buffer: Buffer): Promise<{ success: boolean; text?: string; pages?: string[]; error?: string }> {
        try {
            const pageTexts: string[] = [];

            const data = await pdf(buffer, {
                pagerender: async (pageData: any) => {
                    const textContent = await pageData.getTextContent();
                    const text = (textContent.items as any[])
                        .map((item: any) => item.str)
                        .join(' ')
                        .trim();
                    pageTexts.push(text);
                    return text;
                },
            });

            return {
                success: true,
                text: data.text?.trim() || '',
                pages: pageTexts,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    //* -------------------------------------------------------------------------- */
    //*                      TRY EXTRACT TEXT FROM DOCX METHOD                     */
    //* -------------------------------------------------------------------------- */
    private async tryExtractTextFromDocx(buffer: Buffer): Promise<{ success: boolean; text?: string; error?: string }> {
        try {
            const result = await mammoth.extractRawText({ buffer });
            const text = result.value?.trim() || '';

            return {
                success: true,
                text: text
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export default AttachmentAnalyzer;
