import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";

class KnowledgeBaseRepository extends BaseRepository {
    private static instance: KnowledgeBaseRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.KNOWLEDGE_BASE, [
            { key: { userId: 1, tenantId: 1 } },
            { key: { hash: 1 } },
            { key: { ingestionStatus: 1 } },
            { key: { createdAt: -1 } },
        ]);
    }

    public static getInstance(): KnowledgeBaseRepository {
        if (!KnowledgeBaseRepository.instance) {
            KnowledgeBaseRepository.instance = new KnowledgeBaseRepository();
        }
        return KnowledgeBaseRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }
}

export default KnowledgeBaseRepository;

