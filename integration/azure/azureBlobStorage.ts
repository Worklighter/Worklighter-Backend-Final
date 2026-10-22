import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { Readable } from 'stream';
import BlobContentDisposition from '../../core/enums/blobContentDisposition';

class AzureBlobStorage {
    private static instance: AzureBlobStorage;
    private containerClient: ContainerClient | null = null;

    private constructor() { }


    //* -------------------------------------------------------------------------- */
    //*                               INIT METHOD                                  */
    //* -------------------------------------------------------------------------- */
    public init(blobServiceClient: BlobServiceClient, containerName: string): void {
        AzureBlobStorage.instance.containerClient = blobServiceClient.getContainerClient(containerName);
    }


    //* -------------------------------------------------------------------------- */
    //*                           GET INSTANCE METHOD                              */
    //* -------------------------------------------------------------------------- */
    public static getInstance(): AzureBlobStorage {
        if (!AzureBlobStorage.instance) {
            AzureBlobStorage.instance = new AzureBlobStorage();
        }
        return AzureBlobStorage.instance;
    }


    //* -------------------------------------------------------------------------- */
    //*                         UPLOAD TO FOLDER METHOD                            */
    //* -------------------------------------------------------------------------- */
    public async uploadToFolder(stream: Readable, originalname: string, folderPath: string, contentDisposition?: BlobContentDisposition, tenantId?: string): Promise<string> {
        if (!this.containerClient) {
            throw new Error('Container client is not set. Make sure to initialize AzureBlobStorage.');
        }
        const prefix = tenantId ? `${tenantId}/${folderPath}` : folderPath;
        const blobName = `${prefix}/${uuidv4()}${path.extname(originalname)}`;
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadStream(stream, undefined, undefined, {
            blobHTTPHeaders: contentDisposition ? { blobContentDisposition: contentDisposition } : undefined,
        });
        return blockBlobClient.url;
    }


    //* -------------------------------------------------------------------------- */
    //*                           DOWNLOAD BLOB METHOD                             */
    //* -------------------------------------------------------------------------- */
    public async downloadBlob(blobUrl: string): Promise<Buffer> {
        if (!this.containerClient) {
            throw new Error('Container client is not set. Make sure to initialize AzureBlobStorage.');
        }
        const containerUrl = decodeURIComponent(this.containerClient.url.replace(/\/$/, ''));
        const blobName = decodeURIComponent(blobUrl).replace(`${containerUrl}/`, '');
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

        return await blockBlobClient.downloadToBuffer();
    }


    //* -------------------------------------------------------------------------- */
    //*                            UPLOAD FILE METHOD                              */
    //* -------------------------------------------------------------------------- */
    public async uploadFile(stream: Readable, originalname: string): Promise<string> {
        if (!this.containerClient) {
            throw new Error('Container client is not set. Make sure to initialize AzureBlobStorage.');
        }
        const blobName = `${uuidv4()}${path.extname(originalname)}`;
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadStream(stream);
        return blockBlobClient.url;
    }


    //* -------------------------------------------------------------------------- */
    //*                       UPLOAD SINGLE IMAGE METHOD                           */
    //* -------------------------------------------------------------------------- */
    public async uploadSingleImage(stream: Readable, originalname: string): Promise<string> {
        try {
            const url = await this.uploadFile(stream, originalname);
            return url;
        } catch (error) {
            throw new Error(`Failed to upload file: ${error.message}`);
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                         UPLOAD IMAGE METHOD                                */
    //* -------------------------------------------------------------------------- */
    public async uploadImage(stream: Readable, originalname: string, folder: string, tenantId?: string): Promise<string> {
        try {
            const url = await this.uploadToFolder(stream, originalname, folder, undefined, tenantId);
            return url;
        } catch (error) {
            throw new Error(`Failed to upload image: ${error.message}`);
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                          UPLOAD DOCUMENT METHOD                            */
    //* -------------------------------------------------------------------------- */
    public async uploadDocument(stream: Readable, originalname: string, contentDisposition?: BlobContentDisposition, tenantId?: string): Promise<string> {
        if (!this.containerClient) {
            throw new Error('Container client is not set. Make sure to initialize AzureBlobStorage.');
        }
        const folder = tenantId ? `${tenantId}/Docs` : 'Docs';
        const blobName = `${folder}/${uuidv4()}${path.extname(originalname)}`;
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadStream(stream, undefined, undefined, {
            blobHTTPHeaders: contentDisposition ? { blobContentDisposition: contentDisposition } : undefined,
        });
        return blockBlobClient.url;
    }


    //* -------------------------------------------------------------------------- */
    //*                            DELETE FILE METHOD                              */
    //* -------------------------------------------------------------------------- */
    public async deleteFile(blobName: string): Promise<void> {
        try {
            if (!this.containerClient) {
                throw new Error('Container client is not set. Make sure to initialize AzureBlobStorage.');
            }
            const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.delete();
        } catch (error) {
            throw new Error(`Failed to delete file: ${error.message}`);
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                            LIST FILES METHOD                               */
    //* -------------------------------------------------------------------------- */
    public async listFiles(): Promise<string[]> {
        try {
            if (!this.containerClient) {
                throw new Error('Container client is not set. Make sure to initialize AzureBlobStorage.');
            }
            const urls: string[] = [];
            for await (const blob of this.containerClient.listBlobsFlat()) {
                urls.push(blob.name);
            }
            return urls;
        } catch (error) {
            throw new Error(`Failed to list files: ${error.message}`);
        }
    }
}



export default AzureBlobStorage;