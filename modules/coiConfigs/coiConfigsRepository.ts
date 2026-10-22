import BaseRepository from "../../core/repositories/baseRepository";

class CoiAlertConfigRepository extends BaseRepository {
    private static instance: CoiAlertConfigRepository;

    private constructor() {
        super('coi_alert_configs', []);
    }

    public static getInstance(): CoiAlertConfigRepository {
        if (!CoiAlertConfigRepository.instance) {
            CoiAlertConfigRepository.instance = new CoiAlertConfigRepository();
        }
        return CoiAlertConfigRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }
}

export default CoiAlertConfigRepository;
