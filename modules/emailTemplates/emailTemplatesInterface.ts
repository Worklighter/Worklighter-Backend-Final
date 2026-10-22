import EmailTemplateFormat from '../../core/enums/emailTemplateFormat';

export interface IEmailTemplates {
    _id: string,
    templateName: string,
    templateType: string,
    slug: string,
    subject: string,
    templateFormat: EmailTemplateFormat,
    mjml: string,
    html: string,
    text: string,
    createdAt: string,
    updatedAt: string,
    createdBy: string,
    updatedBy: string,
    deletedAt: string
}

export const optimizedEmailTemplatesResponseFields = [
    '_id',
    'templateName',
    'slug',
    'templateType',
    'subject',
    'templateFormat',
    'mjml',
    'html',
    'text',
    'createdAt'
];
