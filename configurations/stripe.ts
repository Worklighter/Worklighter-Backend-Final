import { Application } from '../app';

export interface IStripeConfig {
    publishableKey: string;
    secretKey: string;
    webhookSecret: string;
}

export class StripeConfig {
    public static GetStripeConf(): IStripeConfig {
        return Application.conf.SERVICES.stripe;
    }
}

export default StripeConfig;
