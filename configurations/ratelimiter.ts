import { Options } from 'express-rate-limit';
import EnvironmentTypes from '../core/enums/environmentTypes';
export abstract class RateLimitConfig {

    private static readonly MS_PER_SECOND: number = 1000;
    private static readonly SECONDS_PER_MINUTE: number = 60;
    private static readonly MINUTES_15: number = 15;
    private static readonly MINUTES_1: number = 1;

    private static readonly WINDOW_MS_DEFAULT: number = this.MINUTES_15 * this.SECONDS_PER_MINUTE * this.MS_PER_SECOND;
    private static readonly MAX_REQUESTS_PROD: number = 100;
    private static readonly MAX_REQUESTS_DEV: number = 1000;
    private static readonly WINDOW_MS_SENSITIVE: number = this.MINUTES_1 * this.SECONDS_PER_MINUTE * this.MS_PER_SECOND;
    private static readonly MAX_ATTEMPTS_SENSITIVE: number = 5;

    public static getDefaultRateLimit(env: string): Options {
        const isProduction = env === EnvironmentTypes.PROD;
        return <Options>{
            windowMs: this.WINDOW_MS_DEFAULT,
            max: isProduction ? this.MAX_REQUESTS_PROD : this.MAX_REQUESTS_DEV,
            message: 'Too many requests, please try again',
            standardHeaders: true,
            legacyHeaders: false,
        };
    }

    public static getSensitiveRouteRateLimit(): Options {
        return <Options>{
            windowMs: this.WINDOW_MS_SENSITIVE,
            max: this.MAX_ATTEMPTS_SENSITIVE,
            message: 'Too many attempts, please try again',
            standardHeaders: true,
            legacyHeaders: false,
        };
    }
}