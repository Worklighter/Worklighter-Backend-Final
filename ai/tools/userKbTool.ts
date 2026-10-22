import { HttpStatusCode } from "axios";
import { z } from "zod";
import { CustomError } from "../../core/errors/custom";
import IJWTPayload from "../../core/interfaces/jwt";
import AzureAISearch from "../../integration/azure/aiSearch";
import { KnowledgeBaseUtils } from "../../modules/knowledgeBase/knowledgeBaseUtils";

export const USER_KB_TOOL_NAME = 'search_called_user_kb';

export const UserKbToolInputSchema = z.object({
    query: z.string().trim().min(1).max(2000),
    topK: z.number().int().positive().max(50).optional(),
});

export type UserKbToolInput = z.infer<typeof UserKbToolInputSchema>;

export interface UserKbToolResultItem {
    documentId: string;
    chunkId: string;
    chunkOrder: number;
    title: string;
    snippet: string;
    score?: number;
}

export async function searchCalledUserKb(input: UserKbToolInput, user: IJWTPayload): Promise<UserKbToolResultItem[]> {
    const userId = user?.id;
    const tenantId = user?.tenantId || user?.id;
    if (!userId) throw new CustomError(HttpStatusCode.Unauthorized, 'Unauthorized');
    if (!tenantId) throw new CustomError(HttpStatusCode.BadRequest, 'Tenant ID is required');

    const topK = input.topK ?? 8;
    const result = await AzureAISearch.getInstance().retrieveDocuments(input.query, userId, tenantId, topK);

    return result.matches.map(m => ({
        documentId: m.documentId,
        chunkId: m.chunkId,
        chunkOrder: m.chunkOrder,
        title: m.documentName,
        snippet: KnowledgeBaseUtils.buildSnippet(m.content, 280),
        score: m.score,
    }));
}

