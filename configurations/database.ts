import { error } from 'winston';
import { Application } from '../app'

export interface DBConfigMongo {
    auth?: {
        password: string,
        username: string
    },
    dbname: string;
    host: string;
    port: number;
    protocol?: string;
    atlas?: boolean
}


export interface ContainerConfiguration {
    containerId: string;
    partitionKey: string;
}


export class DBConfig {
    public static GetDbConf(databaseType: string) {
        switch (databaseType) {
            case 'mongo':
                return Application.conf.DB.mongodb.configuration;
            default:
                throw error('Invalid database type passed');
        }
    }

}