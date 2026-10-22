import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";


class EmailsRepository extends BaseRepository {
    private static instance: EmailsRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.EMAILS, []);
    }

    public static getInstance(): EmailsRepository {
        if (!EmailsRepository.instance) {
            EmailsRepository.instance = new EmailsRepository();
        }
        return EmailsRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }

}


export default EmailsRepository;