import AuditLogsRepository from '../../modules/auditLogs/auditLogsRepository';
import { IWriteAuditEventDTO } from '../../modules/auditLogs/auditLogsInterface';


//* -------------------------------------------------------------------------- */
//*                            AUDIT LOGGER HELPER                             */
//* -------------------------------------------------------------------------- */
//* Fire-and-forget wrapper around AuditLogsRepository.writeEvent().
//* Audit failures are caught and logged to console — they NEVER propagate
//* to the calling pipeline so a failed audit write cannot break document processing.
//* Usage:  void AuditLogger.write({ ... });

abstract class AuditLogger {

    public static write(dto: IWriteAuditEventDTO): void {
        AuditLogsRepository.getInstance()
            .writeEvent(dto)
            .catch((err) => {
                console.error(`⚠️  [AuditLogger] Failed to write audit event '${dto.event}' for submission ${dto.submissionId}:`, err?.message ?? err);
            });
    }

}

export default AuditLogger;
