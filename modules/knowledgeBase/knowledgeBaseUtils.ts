import { IKnowledgeBaseContentChunk } from "./knowledgeBaseInterface";

export abstract class KnowledgeBaseUtils {

    public static normalizeText(text: string): string {
        return (text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    public static calculateTokenCount(text: string): number {
        if (!text) return 0;
        // Simple approximation: ~4 chars per token (works reasonably well for English prose)
        return Math.max(1, Math.ceil(text.length / 4));
    }

    public static normalizeChunk(chunk: Partial<IKnowledgeBaseContentChunk>): IKnowledgeBaseContentChunk {
        return {
            code: (chunk?.code || '').trim(),
            type: (chunk?.type || '').trim(),
            title: (chunk?.title || '').trim(),
            description: this.normalizeText(chunk?.description || ''),
        };
    }

    public static chunkToText(chunk: IKnowledgeBaseContentChunk): string {
        const fields = [
            chunk.code ? `code: ${chunk.code}` : '',
            chunk.type ? `type: ${chunk.type}` : '',
            chunk.title ? `title: ${chunk.title}` : '',
            chunk.description ? `description: ${chunk.description}` : '',
        ].filter(Boolean);

        return this.normalizeText(fields.join('\n'));
    }

    public static chunksToIndexText(chunks: IKnowledgeBaseContentChunk[]): string {
        return chunks
            .map(chunk => this.chunkToText(chunk))
            .filter(Boolean)
            .join('\n\n');
    }

    public static calculateTokenCountForChunks(chunks: IKnowledgeBaseContentChunk[]): number {
        return chunks.reduce((sum, chunk) => sum + this.calculateTokenCount(this.chunkToText(chunk)), 0);
    }

    public static buildSnippet(text: string, maxLength: number = 280): string {
        const clean = this.normalizeText(text || '');
        if (clean.length <= maxLength) return clean;
        return clean.slice(0, maxLength - 1) + '...';
    }
}
