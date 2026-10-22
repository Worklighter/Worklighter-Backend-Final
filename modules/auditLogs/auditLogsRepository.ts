import { MONGODB_COLLECTIONS } from '../../utils/constants';
import BaseRepository from '../../core/repositories/baseRepository';
import { IAuditLog, IWriteAuditEventDTO } from './auditLogsInterface';
import { Utils } from '../../utils/utils';


class AuditLogsRepository extends BaseRepository {
    private static instance: AuditLogsRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.DOCUMENT_AUDIT_LOGS, []);
    }

    public static getInstance(): AuditLogsRepository {
        if (!AuditLogsRepository.instance) {
            AuditLogsRepository.instance = new AuditLogsRepository();
        }
        return AuditLogsRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }


    //* -------------------------------------------------------------------------- */
    //*                          WRITE AUDIT EVENT METHOD                          */
    //* -------------------------------------------------------------------------- */
    public async writeEvent(dto: IWriteAuditEventDTO): Promise<void> {
        const { submissionId, tenantId, event, attachmentOrder, reviewQueue, metadata, before, after } = dto;
        const record = {
            submissionId,
            tenantId,
            event,
            actor: dto.actor ?? { type: 'system' as const },
            timestamp: Utils.getCurrentDate(),
            ...(attachmentOrder !== undefined && { attachmentOrder }),
            ...(reviewQueue && { reviewQueue }),
            ...(metadata && { metadata }),
            ...(before && { before }),
            ...(after && { after }),
        };

        await this.collection.insertOne(record);
    }
}


export default AuditLogsRepository;
