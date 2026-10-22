import { DBConfigMongo } from '../../configurations/database';
import { AzureMediaStorageServiceConfig } from '../../configurations/services';

export interface AESEncryption {
    key: string,
    iv: string
}

export interface AESEncryptionModes {
    gmc: AESEncryption
}

export interface DB {
    mongodb: {
        configuration: DBConfigMongo
    }
}


export interface Notification {
    token?: string,
    serviceUrl: string
}

export interface JWT {
    api: string
}


export interface API {
    trackAuth: boolean,
    trackApi: boolean
}


export interface NodemailerSMTP {
    host: string;
    port: number;
    service: string;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    }
}


export interface Email {
    nodeMailer: NodemailerSMTP
}


export interface AzureGPT {
    endpoint: string,
    deploymentName: string,
    //* Separate deployment used for QA/inspector calls (higher-capability model)
    qaDeploymentName?: string,
    apiVersion: string,
    apiKey: string
}


export interface OpenAIGPT {
    deploymentName: string,
    apiKey: string
}


export interface LLM {
    aiModelProvider: string,
    azureGPT?: AzureGPT,
    openAIGPT?: OpenAIGPT
}

export interface StripeServiceConfig {
    publishableKey: string;
    secretKey: string;
    webhookSecret: string;
}

export interface Services {
    email: Email,
    redis: Redis,
    llm: LLM,
    AZURE: AZURE,
    MAILGUN:{
        signingKey: string
    },
    stripe: StripeServiceConfig,
}


interface DOCUMENT_INTELLIGENCE_SERVICE {
    endpoint: string,
    apiKey: string
}

interface AI_SEARCH_SERVICE {
    endpoint: string;
    apiKey: string;
    apiVersion: string;
    codesIndexName: string;
    jobsIndexName: string;
    dimensionAwareIndex: boolean;
}

interface AZURE_OPENAI_EMBEDDING_SERVICE {
    endpoint: string;
    deployment: string;
    apiVersion: string;
    apiKey: string;
    dimensions: number;
}


export interface ServiceBus {
    conntections: {
        primary: string,
        secondary: string
    },
    topics: Record<string, string>,
    queues?: Record<string, string>
}

export interface AsymmetricEncryption {
    api: {
        publicKey: string,
        privateKey: string,
        passphrase: string
    }
}


export interface Encryption {
    jwt: AsymmetricEncryption,
    aesEncryption?: AESEncryptionModes
}


export interface Redis {
    url: string
}


export interface Urls {
    frontendBaseUrl: string,
    appUrl: string,
    supportEmail: string,
}


export interface IAppConfig {
    PORT: number,
    ENV: string,
    DB: DB,
    URLS: Urls,
    ENCRYPTION: Encryption,
    SERVICES: Services,
    CLIENT_URL: string,
}

export interface AZURE {
    MEDIA_STORAGE_SERVICE?: AzureMediaStorageServiceConfig,
    DOCUMENT_INTELLIGENCE_SERVICE: DOCUMENT_INTELLIGENCE_SERVICE,
    AI_SEARCH_SERVICE?: AI_SEARCH_SERVICE,
    OPENAI_EMBEDDINGS?: AZURE_OPENAI_EMBEDDING_SERVICE,
}
