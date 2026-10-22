import { z } from "zod";
import DocumentSegmenterPrompt from "../prompts/documentSegmenterPrompt";
import { LLMClientFactory } from "../llms/llmClientFactory";
import { PageSegment } from "../../utils/helpers/documentPageSegmenter";

const PageBoundarySchema = z.object({
    segments: z.array(
        z.object({
            pageIndices: z.array(z.number().int().nonnegative()),
            documentType: z.enum(["invoice", "daily_log", "coi", "unknown"]),
        })
    ).min(1),
});

export type PageBoundaryOutput = z.infer<typeof PageBoundarySchema>;

const PAGE_HEAD_CHARS = 1000;
const PAGE_TAIL_CHARS = 300;

class DocumentSegmenterChain {

    public static async segmentPages(documentPages: string[]): Promise<PageSegment[]> {
        if (documentPages.length === 0) return [];
        if (documentPages.length === 1) {
            const text = documentPages[0].trim();
            return text.length > 0 ? [{ text, pageIndices: [0] }] : [];
        }

        const pagePreviews = documentPages
            .map((page, idx) => {
                const trimmed = page.trim();
                const preview = trimmed.length <= PAGE_HEAD_CHARS + PAGE_TAIL_CHARS
                    ? trimmed
                    : `${trimmed.substring(0, PAGE_HEAD_CHARS)}\n[... middle omitted ...]\n${trimmed.substring(trimmed.length - PAGE_TAIL_CHARS)}`;
                return `--- PAGE ${idx} ---\n${preview}`;
            })
            .join('\n\n');

        const chain = DocumentSegmenterPrompt.getPageBoundaryPromptTemplate().pipe(
            LLMClientFactory.getLLMClient().getLLMInstance(0.0).withStructuredOutput(PageBoundarySchema, {
                name: "page_boundary_detector",
            })
        );

        const result: PageBoundaryOutput = await chain.invoke({ pagePreviews });

        return result.segments
            .map(seg => ({
                text: seg.pageIndices.map(i => documentPages[i] ?? '').join('\n\n').trim(),
                pageIndices: seg.pageIndices,
            }))
            .filter(seg => seg.text.length > 0);
    }

}

export default DocumentSegmenterChain;
