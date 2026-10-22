import BaseRepository from '../../core/repositories/baseRepository';
import { MONGODB_COLLECTIONS } from '../../utils/constants';


class EmailThreadsRepository extends BaseRepository {
    private static instance: EmailThreadsRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.EMAIL_THREADS, []);
    }

    public static getInstance(): EmailThreadsRepository {
        if (!EmailThreadsRepository.instance) {
            EmailThreadsRepository.instance = new EmailThreadsRepository();
        }
        return EmailThreadsRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }
}



export default EmailThreadsRepository;