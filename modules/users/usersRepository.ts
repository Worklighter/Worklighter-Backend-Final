import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";
import { Logger } from "../../utils/helpers/logger";
import {
    buildDefaultPlatformAdminSeed,
    buildTenantUsersSeed,
} from "./usersSeeder";
import UsersModel from "./usersModel";
import { IUsers } from "./usersInterface";

class UsersRepository extends BaseRepository {
    private static instance: UsersRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.USERS, []);
    }

    public static getInstance(): UsersRepository {
        if (!UsersRepository.instance) {
            UsersRepository.instance = new UsersRepository();
        }
        return UsersRepository.instance;
    }

    public async INIT() {
        await super.INIT();
        await this.Seeder();
    }

    private async Seeder() {
        const defaultPlatformAdmin = await buildDefaultPlatformAdminSeed();
        const nonAdminUserCount = await this.Count([
            {
                param: "email",
                value: defaultPlatformAdmin.email,
                operator: "AND",
                operationType: "not_equals",
            },
        ]);

        if (!nonAdminUserCount) {
            const users = await buildTenantUsersSeed();
            if (users.length) {
                const records = users.map((user: Partial<IUsers>) => UsersModel.create(user));
                await this.AddMany(records);
            }
        }

        const { password, createdAt, createdBy, ...platformAdminFields } = defaultPlatformAdmin;
        await this.collection.updateOne(
            { email: defaultPlatformAdmin.email },
            {
                $set: platformAdminFields,
                $setOnInsert: { password, createdAt, createdBy }
            },
            { upsert: true }
        );

        Logger.Console(
            `Users bootstrap ensured platform admin seed for ${defaultPlatformAdmin.email}`,
            "info",
        );
    }

}

export default UsersRepository;
