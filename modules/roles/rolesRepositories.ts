import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";
import { RolesSeed } from "./rolesSeeder";


class RolesRepository extends BaseRepository {
    private static instance: RolesRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.ROLES, []);
    }

    public static getInstance(): RolesRepository {
        if (!RolesRepository.instance) {
            RolesRepository.instance = new RolesRepository();
        }
        return RolesRepository.instance;
    }

    public async INIT() {
        await super.INIT();
        await this.Seeder();
    }

    private async Seeder() {
        for (const role of RolesSeed) {
            await this.collection.updateOne(
                { slug: role.slug },
                { $setOnInsert: role },
                { upsert: true }
            );
        }
    }


}


export default RolesRepository;
