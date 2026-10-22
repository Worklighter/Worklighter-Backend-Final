import { Application } from '../app';
export interface IRedisConfig {
    url: string;
}



export class RedisConfig {
    public static GetRedisConf() {
        return {
            url: Application.conf.SERVICES.redis.url
        }
    }
}

export default RedisConfig;