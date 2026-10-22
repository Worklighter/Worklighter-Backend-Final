import { ObjectId } from "mongodb";
import BaseRepository from "../../core/repositories/baseRepository";
import { MONGODB_COLLECTIONS } from "../../utils/constants";
import QueryOperators from "../../core/enums/queryOperators";
import { buildEmailTemplatesSeed } from "./emailTemplatesSeeder";
import { Application } from "../../app";

class EmailTemplatesRepository extends BaseRepository {
    private static instance: EmailTemplatesRepository;

    private constructor() {
        super(MONGODB_COLLECTIONS.EMAIL_TEMPLATES, []);
    }

    public static getInstance(): EmailTemplatesRepository {
        if (!EmailTemplatesRepository.instance) {
            EmailTemplatesRepository.instance = new EmailTemplatesRepository();
        }
        return EmailTemplatesRepository.instance;
    }

    public async INIT() {
        await super.INIT();
        await this.Seeder();
    }

    private async Seeder() {
        const templates = buildEmailTemplatesSeed(
            Application.conf.URLS.appUrl,
            Application.conf.URLS.supportEmail,
        );

        // Check if templates already exist
        const count = await this.Count();

        if (!count || count === 0) {
            console.log('📧 Seeding email templates...');
            await this.AddMany(templates);
            console.log('✅ Email templates seeded successfully');
        } else {
            for (const template of templates) {
                const existing = await this.GetOneByParams(
                    [
                        {
                            param: 'slug',
                            value: template.slug,
                            operator: QueryOperators.AND
                        }
                    ],
                    ['_id', 'templateFormat']
                ) as { _id: ObjectId; templateFormat?: string } | null;

                if (!existing) {
                    console.log(`📧 Adding missing template: ${template.templateName}`);
                    await this.Add(template);
                } else {
                    // Always sync templateFormat and mjml so existing records pick up MJML upgrades
                    await this.Update(new ObjectId(existing._id), {
                        templateFormat: template.templateFormat,
                        mjml: template.mjml,
                        subject: template.subject,
                        text: template.text,
                        updatedAt: new Date().toISOString(),
                    }, []);
                }
            }
        }
    }
}

export default EmailTemplatesRepository;