import nodemailer, { Transporter, SendMailOptions } from 'nodemailer';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mjml2html: (input: string, options?: object) => Promise<{ html: string; errors: any[] }> = require('mjml');
import { IEmailTemplates, optimizedEmailTemplatesResponseFields } from '../modules/emailTemplates/emailTemplatesInterface';
import { Application } from '../app';
import { Logger } from '../utils/helpers/logger';
import { NodemailerSMTP } from '../core/interfaces/appConfig';
import { IEmailAttachment } from '../core/interfaces/generalInterface';
import EmailTemplateFormat from '../core/enums/emailTemplateFormat';
import QueryOperators from '../core/enums/queryOperators';

class EmailService {
    private static instance: EmailService;
    private transporter: Transporter;
    private constructor() { }

    public async init(config: NodemailerSMTP) {
        const emailConfig = config;
        this.transporter = nodemailer.createTransport(emailConfig);
        await this.verify();
    }

    async verify() {
        try {
            await this.transporter.verify();
            Logger.Console(`SMTP Server Connected Successfully!`, 'info');
        } catch (error) {
            console.error(error.message);
        }
    }

    public static getInstance(): EmailService {
        if (!EmailService.instance) {
            EmailService.instance = new EmailService();
        }
        return EmailService.instance;
    }

    public async sendMail(recepient: string, templateSlug: string, placeholders: Record<string, any>, subject: string = null, attachments: IEmailAttachment[] = []): Promise<void> {
        try {
            const emailTemplatesModule = await import('../modules/emailTemplates/emailTemplatesRepository.js');
            const EmailTemplatesRepository =
                (emailTemplatesModule as any).default?.default ??
                (emailTemplatesModule as any).default ??
                emailTemplatesModule;

            const emailTemplate = await EmailTemplatesRepository.getInstance().GetOneByParams(
                [
                    {
                        param: 'slug',
                        value: templateSlug,
                        operator: QueryOperators.AND
                    }
                ],
                optimizedEmailTemplatesResponseFields
            ) as IEmailTemplates;

            if (!emailTemplate) {
                throw new Error(`No template found for slug: ${templateSlug}`);
            }

            const data = await this.prepareEmailContent(recepient, emailTemplate, placeholders, subject);
            const mailOptions: SendMailOptions = {
                from: Application.conf.SERVICES.email.nodeMailer.auth.user,
                ...data,
                attachments
            };

            await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email sent to ${recepient}`);

        } catch (error) {
            console.error(`❌ Error sending email: ${error}`);
            throw new Error('Error sending email');
        }
    }

    private async prepareEmailContent(
        recepient: string,
        template: IEmailTemplates,
        placeholders: Record<string, any>,
        subject: string = null
    ) {
        let htmlContent: string | null = null;
        let textContent: string | null = null;

        if (template.templateFormat === EmailTemplateFormat.MJML && template.mjml) {
            const rawMjml = this.replacePlaceholders(template.mjml, placeholders);
            const { html, errors } = await mjml2html(rawMjml, { validationLevel: 'soft' });
            if (errors?.length) {
                console.warn(`⚠️ MJML compile warnings for template "${template.slug}":`, errors);
            }
            htmlContent = html;
        } else if (template.html) {
            htmlContent = this.replacePlaceholders(template.html, placeholders);
        }

        if (template.text) {
            textContent = this.replacePlaceholders(template.text, placeholders);
        }

        const subjectLine = subject || this.replacePlaceholders(template.subject, placeholders);

        return {
            to: recepient,
            subject: subjectLine,
            ...(htmlContent ? { html: htmlContent } : {}),
            ...(textContent ? { text: textContent } : {}),
        };
    }

    private replacePlaceholders(content: string, placeholders: Record<string, any>): string {
        return Object.keys(placeholders).reduce((result, key) => {
            return result.replace(new RegExp(`{{${key}}}`, 'g'), placeholders[key] ?? '');
        }, content);
    }
}

export default EmailService;
