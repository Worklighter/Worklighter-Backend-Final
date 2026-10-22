import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";

class IssuedTokensRepository extends BaseRepository {
    private static instance: IssuedTokensRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.ISSUED_TOKENS, []);
    }

    public static getInstance(): IssuedTokensRepository {
        if (!IssuedTokensRepository.instance) {
            IssuedTokensRepository.instance = new IssuedTokensRepository();
        }
        return IssuedTokensRepository.instance;
    }

    public async INIT(): Promise<void> {
        await super.INIT();
    }
}

export default IssuedTokensRepository;
