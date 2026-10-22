import { Db, MongoClient } from "mongodb";
import { DBConfigMongo } from "../configurations/database";
import { Logger } from "../utils/helpers/logger";
import { BehaviorSubject } from "rxjs";




abstract class MongoDatabase {

    private static mongoClient: MongoClient;


    public static db: BehaviorSubject<Db | any> = new BehaviorSubject(undefined);


    public static async connect(dbConf: DBConfigMongo) {
        try {
            if (!this.mongoClient || !this.db) {
                if (dbConf.atlas) {
                    this.mongoClient = await MongoClient.connect(dbConf?.auth ? `mongodb+srv://${dbConf.auth?.username}:${dbConf.auth?.password}@${dbConf.host}` : `mongodb+srv://${dbConf.host}`, {
                        retryWrites: true,
                        w: 'majority'
                    });
                }

                else this.mongoClient = await MongoClient.connect(dbConf?.auth?.username ? `mongodb://${dbConf.auth?.username}:${encodeURIComponent(dbConf.auth?.password)}@${dbConf.host}:${dbConf.port}` : `mongodb://${dbConf.host}:${dbConf.port}`, {
                    retryWrites: true,
                    w: 'majority'
                });

                this.db.next(this.mongoClient.db(dbConf.dbname));
                if (!this.db) this.mongoClient.close();
            }
            Logger.Console(`Connected to Mongodb successfully`, 'info');
            return this.db.getValue();
        }
        catch (error) {
            Logger.Console('Failed to connect to mongodb: ' + error.message, 'error');
            throw error;
        }
    }



}

export default MongoDatabase;