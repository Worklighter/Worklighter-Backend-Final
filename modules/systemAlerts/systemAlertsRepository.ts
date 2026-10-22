import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";


class SystemAlertsRepository extends BaseRepository {
    private static instance: SystemAlertsRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.SYSTEM_ALERTS, []);
    }

    public static getInstance(): SystemAlertsRepository {
        if (!SystemAlertsRepository.instance) {
            SystemAlertsRepository.instance = new SystemAlertsRepository();
        }
        return SystemAlertsRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }

}

export default SystemAlertsRepository;