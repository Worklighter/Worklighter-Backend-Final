import { Request, Response } from 'express'
import FillableField from './fillableFields'
import { BaseChatModel } from "@langchain/core/language_models/chat_models"

export interface Location {
    lat: number,
    long: number,
    address?: string
}


export const GeneralFillables: FillableField[] = [
    { column: 'createdAt', columnDataType: 'string' },
    { column: 'createdBy', columnDataType: 'string' },
    { column: 'updatedAt', columnDataType: 'string' },
    { column: 'updatedBy', columnDataType: 'string' },
    { column: 'deletedAt', columnDataType: 'string' },
]



export interface PaginationParametersDTO {
    paginate?: boolean,
    continuationToken: string,
    pageSize: number
}


export interface IApiResponseOptions {
    res: Response,
    code: number,
    status: boolean,
    responseCode: string,
    responseDescription: string,
    data?: Record<string, any> | Record<string, any>[] | null,
    req?: Request
}


export interface IAttachments {
    type: string,
    url: string
}


export interface DataStructureForPatchOperation {
    key: string;
    value: any;
    op?: 'replace' | 'set' | 'add' | 'incr' | 'remove';
}


export interface IEmailTemplates {
    slug: string,
    subject: string,
    html?: string,
    text?: string
}

export interface IEmailAttachment {
    filename: string,
    content: string | Buffer,
    contentType?: string,
    cid?: string,
    encoding?: string
}



export interface ILLMClient {
    getLLMInstance(temperature: number): BaseChatModel;
    //* Returns an LLM instance configured for the QA/inspector role.
    //* For Azure: uses the dedicated qaDeploymentName if set, otherwise falls back to deploymentName.
    //* For OpenAI: delegates to getLLMInstance (no separate deployment concept).
    getQALLMInstance(temperature: number): BaseChatModel;
    //* Returns the deployment/model name used by getLLMInstance — used to label token receipts.
    getDeploymentName(): string;
    //* Returns the deployment/model name used by getQALLMInstance — used to label token receipts.
    getQADeploymentName(): string;
}