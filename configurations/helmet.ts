import { HelmetOptions } from 'helmet';
import EnvironmentTypes from '../core/enums/environmentTypes';
export abstract class HelmetConfig {

    public static getConfig(env: string): HelmetOptions {
        const isProduction = env === EnvironmentTypes.PROD;

        return {
            dnsPrefetchControl: { allow: false },
            frameguard: { action: 'sameorigin' },
            hidePoweredBy: true,
            hsts: isProduction ? {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true,
            } : false,
            ieNoOpen: true,
            noSniff: true,
            referrerPolicy: { policy: 'no-referrer' },
            xssFilter: true,
        };
    }
}
