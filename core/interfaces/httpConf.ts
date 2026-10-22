export interface IHttpConf {
    AllowCors: boolean;
    GracefullShutdown: boolean
    VAULT: boolean,
    ServiceName: string,
    QUEUE:null,
    services?: {
        [key: string]: {
            host: string,
            port: string,
            protocol: string
        }
    }
}
