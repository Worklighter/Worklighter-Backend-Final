import BaseRepository from "../../core/repositories/baseRepository";

class CoiVendorsRepository extends BaseRepository {
    private static instance: CoiVendorsRepository;

    private constructor() {
        super('coi_vendors', []);
    }

    public static getInstance(): CoiVendorsRepository {
        if (!CoiVendorsRepository.instance) {
            CoiVendorsRepository.instance = new CoiVendorsRepository();
        }
        return CoiVendorsRepository.instance;
    }

    public async INIT() {
        await super.INIT();
    }
}

export default CoiVendorsRepository;
