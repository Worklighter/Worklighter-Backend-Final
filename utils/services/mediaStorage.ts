// MediaStorageService.ts

import { BlobServiceClient } from '@azure/storage-blob';
import { AzureMediaStorageServiceConfig } from '../../configurations/services';

class MediaStorageService {
    private static instance: MediaStorageService;
    private blobServiceClient: BlobServiceClient;
    private config: AzureMediaStorageServiceConfig;


    private constructor() { }

    public static getInstance(): MediaStorageService {
        if (!MediaStorageService.instance) {
            MediaStorageService.instance = new MediaStorageService();
        }
        return MediaStorageService.instance;
    }

    private validateConfig(): void {
        if (!this.config.STORAGE_CONNECTION_STRING) {
            throw new Error('Azure Storage connection string is missing.');
        }
        if (!this.config.IMAGES_CONTAINER_NAME) {
            throw new Error('Azure Storage images container name is missing.');
        }
      
    }

    public getBlobServiceClient(): BlobServiceClient {
        return this.blobServiceClient;
    }

    public getConfig(): AzureMediaStorageServiceConfig {
        return this.config;
    }

    public async init(config: AzureMediaStorageServiceConfig): Promise<void> {

        this.config = config;
        this.blobServiceClient = BlobServiceClient.fromConnectionString(this.config.STORAGE_CONNECTION_STRING);
        this.validateConfig();
    }

    private async checkConnection(): Promise<boolean> {
        try {
            const containerList = await this.blobServiceClient.listContainers();
            for await (const _ of containerList) {
                return true;
            }
            return true;
        } catch (error) {
            console.log(error);
            return false;
        }
    }
}

export default MediaStorageService;
