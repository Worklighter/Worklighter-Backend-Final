import { IHttpConf } from './httpConf';

interface IEnvironment {
    env: string;
    logger: 'winston',
    delayStart: number;
    config: IHttpConf,
    vault: {
        // 'aws' | 'hashicorp'
        configType: string;
        keyname: string;
        protocol?: string,
        host?: string
        port?: number;
        login?: string;
        apiversion?: string;
    }

}

export default IEnvironment;