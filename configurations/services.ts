import { Application } from "../app"
import EnvironmentTypes from "../utils/enums/environmentTypes"


export interface AzureMediaStorageServiceConfig {
    STORAGE_CONNECTION_STRING: string,
    IMAGES_CONTAINER_NAME: string,
}

export interface AzureDocumentIntelligenceServiceConfig {
    endpoint: string,
    apiKey: string
}



export class ServicesConfig {


    public static GetMediaStorageServiceConf() {
        switch (global.environment) {
            case EnvironmentTypes.LOCAL:
                return Application.conf.SERVICES.AZURE.MEDIA_STORAGE_SERVICE
            case EnvironmentTypes.STAGING:
                return Application.conf.SERVICES.AZURE.MEDIA_STORAGE_SERVICE
            case EnvironmentTypes.PROD:
                return Application.conf.SERVICES.AZURE.MEDIA_STORAGE_SERVICE
            default:
                return Application.conf.SERVICES.AZURE.MEDIA_STORAGE_SERVICE
        }
    }

    public static GetDocumentIntelligenceServiceConf() {
        return Application.conf.SERVICES.AZURE.DOCUMENT_INTELLIGENCE_SERVICE
    }

}