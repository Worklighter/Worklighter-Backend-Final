import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";

class OtpRepository extends BaseRepository {
    private static instance: OtpRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.OTPS, []);
    }

    public static getInstance(): OtpRepository {
        if (!OtpRepository.instance) {
            OtpRepository.instance = new OtpRepository();
        }
        return OtpRepository.instance;
    }

    // Add this public INIT method
    public async INIT(): Promise<void> {
        await super.INIT();
    }
}

export default OtpRepository;