import cors from 'cors';
import EnvironmentTypes from '../core/enums/environmentTypes';

export abstract class CorsConfig {
//TODO: Change * to allow only valid domain
    public static getConfig(env: string): cors.CorsOptions {
        const envConfig: cors.CorsOptions = env === EnvironmentTypes.PROD
            ? { origin: true }
            : { origin: '*' };

        const defaultConfig: cors.CorsOptions = {
            optionsSuccessStatus: 200,
            methods: ['GET', 'POST', 'HEAD', 'OPTIONS', 'PATCH', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
            ...envConfig,
        };

        return defaultConfig;
    }
}