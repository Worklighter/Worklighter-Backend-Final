import { HttpStatusCode } from "axios";
import { ObjectId } from "mongodb";
import QueryOperators from "../../core/enums/queryOperators";
import { CustomError } from "../../core/errors/custom";
import IJWTPayload from "../../core/interfaces/jwt";
import { Utils } from "../../utils/utils";
import {
    ICoiVendor,
    ICreateVendorDTO,
    IUpdateVendorDTO,
    IGetVendorsDTO,
    IVendorStatsResponse,
    vendorResponseFields
} from "./coiAlertsInterface";
import CoiVendorsRepository from "./coiAlertsRepository";
import CoiVendorModel from "./coiAlertsModel";
import nodemailer from 'nodemailer';
import { Application } from "../../app";
import * as fs from 'fs';
import * as path from 'path';

class CoiAlertsService {

    public async createVendor(data: ICreateVendorDTO, loggedInUser: IJWTPayload): Promise<ICoiVendor> {
        const existingVendor = await CoiVendorsRepository.getInstance().GetOneByParams([
            { param: 'vendorEmail', value: data.vendorEmail, operator: QueryOperators.AND },
            { param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND }
        ], ['_id']);

        if (existingVendor) {
            throw new CustomError(HttpStatusCode.Conflict, 'A vendor with this email already exists');
        }

        const vendorData: Partial<ICoiVendor> = {
            ...data,
            tenantId: loggedInUser.tenantId,
            userId: loggedInUser.id,
            coiDocument: data.coiDocument || null,
            status: this.calculateVendorStatus(data.coiExpirationDate),
            alerts: data.alerts || {
                external: { mode: ['Manual'] },
                internal: { mode: ['Manual'] }
            },
            createdAt: Utils.getCurrentDate(),
            createdBy: loggedInUser.id
        };

        const vendor = CoiVendorModel.create(vendorData);
        return await CoiVendorsRepository.getInstance().Add<ICoiVendor>(vendor, vendorResponseFields);
    }

    public async getVendors(data: IGetVendorsDTO, loggedInUser: IJWTPayload) {
        const filters: any[] = [
            { param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND }
        ];

        if (data.searchText) {
            filters.push({
                param: 'vendorName',
                value: data.searchText,
                operator: QueryOperators.OR,
                operationType: 'contains',
                caseSensitive: false
            });
            filters.push({
                param: 'vendorEmail',
                value: data.searchText,
                operator: QueryOperators.OR,
                operationType: 'contains',
                caseSensitive: false
            });
        }

        if (data.status) {
            filters.push({
                param: 'status',
                value: data.status,
                operator: QueryOperators.AND
            });
        }

        const pageSize = data.pageSize ?? 100;
        const continuationToken = data.continuationToken ?? 0;

        return await CoiVendorsRepository.getInstance().GetAll(
            filters,
            true,
            continuationToken,
            pageSize,
            { createdAt: -1 },
            vendorResponseFields
        );
    }

    public async getVendorCount(data: IGetVendorsDTO, loggedInUser: IJWTPayload): Promise<number> {
        const filters: any[] = [
            { param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND }
        ];

        if (data.searchText) {
            filters.push({
                param: 'vendorName',
                value: data.searchText,
                operator: QueryOperators.OR,
                operationType: 'contains',
                caseSensitive: false
            });
            filters.push({
                param: 'vendorEmail',
                value: data.searchText,
                operator: QueryOperators.OR,
                operationType: 'contains',
                caseSensitive: false
            });
        }

        if (data.status) {
            filters.push({
                param: 'status',
                value: data.status,
                operator: QueryOperators.AND
            });
        }

        return await CoiVendorsRepository.getInstance().Count(filters);
    }

    public async getVendorById(vendorId: string, loggedInUser: IJWTPayload): Promise<ICoiVendor> {
        if (!ObjectId.isValid(vendorId)) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Invalid vendor ID');
        }

        const accessProjection = Array.from(new Set([...vendorResponseFields, 'tenantId', 'userId']));
        const vendor = await CoiVendorsRepository.getInstance().GetById<any>(vendorId, accessProjection);

        if (!vendor) {
            throw new CustomError(HttpStatusCode.NotFound, 'Vendor not found');
        }

        if (vendor.tenantId !== loggedInUser.tenantId) {
            throw new CustomError(HttpStatusCode.Forbidden, 'Access denied');
        }

        return Utils.selectFieldsFromObject(vendor, vendorResponseFields) as ICoiVendor;
    }

    public async updateVendor(data: IUpdateVendorDTO, loggedInUser: IJWTPayload): Promise<ICoiVendor> {
        const { vendorId, ...updateData } = data;

        const vendor = await this.getVendorById(vendorId, loggedInUser);

        if (updateData.vendorEmail && updateData.vendorEmail !== vendor.vendorEmail) {
            const existingVendor = await CoiVendorsRepository.getInstance().GetOneByParams([
                { param: 'vendorEmail', value: updateData.vendorEmail, operator: QueryOperators.AND },
                { param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND },
                { param: '_id', value: { $ne: new ObjectId(vendorId).toString() }, operator: QueryOperators.AND }
            ], ['_id']);

            if (existingVendor) {
                throw new CustomError(HttpStatusCode.Conflict, 'Another vendor with this email already exists');
            }
        }

        if (updateData.coiDocument) {
            if ((vendor as any).coiDocument) {
                this.deleteCOIDocumentFile((vendor as any).coiDocument);
            }
            updateData['coiDocument'] = updateData.coiDocument;
        }

        if (updateData.coiExpirationDate !== undefined) {
            updateData['status'] = this.calculateVendorStatus(updateData.coiExpirationDate);
            updateData['coiExpirationDate'] = updateData.coiExpirationDate;
        }

        updateData['updatedAt'] = Utils.getCurrentDate();
        updateData['updatedBy'] = loggedInUser.id;

        return await CoiVendorsRepository.getInstance().Update<ICoiVendor>(
            new ObjectId(vendorId),
            updateData,
            vendorResponseFields
        );
    }

    public async deleteVendor(vendorId: string, loggedInUser: IJWTPayload): Promise<void> {
        const vendor = await this.getVendorById(vendorId, loggedInUser);

        await CoiVendorsRepository.getInstance().SoftDelete(vendorId);

        if ((vendor as any).coiDocument) {
            this.deleteCOIDocumentFile((vendor as any).coiDocument);
        }
    }

    public async uploadCOIDocument(vendorId: string, filename: string, loggedInUser: IJWTPayload): Promise<ICoiVendor> {
        const vendor = await this.getVendorById(vendorId, loggedInUser);

        if ((vendor as any).coiDocument) {
            this.deleteCOIDocumentFile((vendor as any).coiDocument);
        }

        const updateData = {
            coiDocument: filename,
            updatedAt: Utils.getCurrentDate(),
            updatedBy: loggedInUser.id
        };

        return await CoiVendorsRepository.getInstance().Update<ICoiVendor>(
            new ObjectId(vendorId),
            updateData,
            vendorResponseFields
        );
    }

    public async deleteCOIDocument(vendorId: string, loggedInUser: IJWTPayload): Promise<ICoiVendor> {
        const vendor = await this.getVendorById(vendorId, loggedInUser);

        if (!(vendor as any).coiDocument) {
            throw new CustomError(HttpStatusCode.NotFound, 'No COI document found for this vendor');
        }

        this.deleteCOIDocumentFile((vendor as any).coiDocument);

        const updateData = {
            coiDocument: null,
            updatedAt: Utils.getCurrentDate(),
            updatedBy: loggedInUser.id
        };

        return await CoiVendorsRepository.getInstance().Update<ICoiVendor>(
            new ObjectId(vendorId),
            updateData,
            vendorResponseFields
        );
    }

    public async getVendorStats(loggedInUser: IJWTPayload): Promise<IVendorStatsResponse> {
        const stats = await CoiVendorsRepository.getInstance().customAggregator([
            {
                $match: {
                    tenantId: loggedInUser.tenantId,
                    userId: loggedInUser.id,
                    deletedAt: null
                }
            },
            {
                $group: {
                    _id: null,
                    totalVendors: { $sum: 1 },
                    activeCOIs: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    },
                    expiringSoon: {
                        $sum: { $cond: [{ $eq: ['$status', 'expiring_soon'] }, 1, 0] }
                    },
                    expired: {
                        $sum: { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
                    }
                }
            }
        ]) as IVendorStatsResponse[];

        const aggregated = stats[0];

        return {
            totalVendors: aggregated?.totalVendors || 0,
            activeCOIs: aggregated?.activeCOIs || 0,
            expiringSoon: aggregated?.expiringSoon || 0,
            expired: aggregated?.expired || 0
        };
    }

    public async sendManualReminder(vendorId: string, reminderType: string = 'standard', loggedInUser: IJWTPayload): Promise<void> {
        const vendor = await this.getVendorById(vendorId, loggedInUser);

        if (!vendor.vendorEmail) {
            throw new CustomError(HttpStatusCode.BadRequest, 'Vendor email is not available');
        }

        try {
            await this.sendVendorReminderEmail(vendor, reminderType);
            console.log(`Reminder email sent successfully to ${vendor.vendorEmail}`);
        } catch (error) {
            console.error('Failed to send reminder email:', error);
            throw new CustomError(
                HttpStatusCode.InternalServerError,
                `Failed to send reminder email: ${error.message}`
            );
        }
    }

    public async testEmailConfiguration(loggedInUser: IJWTPayload): Promise<void> {
        const testEmail = loggedInUser.email;

        const emailConfig = Application.conf.SERVICES.email.nodeMailer;
        const transporter = nodemailer.createTransport({
            host: emailConfig.host,
            port: emailConfig.port || 587,
            secure: false,
            auth: {
                user: emailConfig.auth.user,
                pass: emailConfig.auth.pass
            }
        });

        await transporter.sendMail({
            from: emailConfig.auth.user,
            to: testEmail,
            subject: 'COI Alert System - Test Email',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2>Email Configuration Test</h2>
                    <p>This is a test email from your COI Alert System.</p>
                    <p>If you received this email, your email configuration is working correctly.</p>
                    <br>
                    <p style="color: #666;">Sent from Worklighter COI Management System</p>
                </div>
            `
        });
    }

    private calculateVendorStatus(expirationDate: string | Date | null): 'active' | 'expiring_soon' | 'expired' {
        if (!expirationDate) return 'active';

        const expDate = new Date(expirationDate);
        const today = new Date();
        const daysUntilExpiration = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiration < 0) return 'expired';
        if (daysUntilExpiration <= 7) return 'expiring_soon';
        return 'active';
    }

    private deleteCOIDocumentFile(filename: string): void {
        try {
            if (/^https?:\/\//i.test(filename)) {
                return;
            }
            const filePath = path.join(process.cwd(), 'uploads/coi-documents/', filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.error('Error deleting COI document file:', error);
        }
    }

    private async sendVendorReminderEmail(vendor: ICoiVendor, reminderType: string): Promise<void> {
        try {
            const emailConfig = Application.conf.SERVICES.email.nodeMailer;

            const transporter = nodemailer.createTransport({
                host: emailConfig.host,
                port: emailConfig.port || 587,
                secure: false,
                auth: {
                    user: emailConfig.auth.user,
                    pass: emailConfig.auth.pass
                }
            });

            await transporter.verify();

            let subject = '';
            let htmlContent = '';

            const expirationDateFormatted = vendor.coiExpirationDate
                ? new Date(vendor.coiExpirationDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })
                : 'Not set';

            switch (reminderType) {
                case 'urgent':
                    subject = 'URGENT: Certificate of Insurance Renewal Required';
                    htmlContent = `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 3px solid #DC2626;">
                            <h2 style="color: #DC2626; border-bottom: 2px solid #DC2626; padding-bottom: 10px;">URGENT: COI Renewal Required</h2>
                            <p>Dear ${vendor.vendorName},</p>
                            <p style="font-size: 16px;"><strong style="color: #DC2626;">Your Certificate of Insurance is expiring soon and requires immediate attention.</strong></p>
                            <div style="background-color: #FEE2E2; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                <p style="margin: 0;"><strong>Expiration Date:</strong> <span style="color: #DC2626; font-size: 18px;">${expirationDateFormatted}</span></p>
                            </div>
                            <p><strong>Please renew your COI as soon as possible to avoid any service disruption.</strong></p>
                            <p>If you have any questions, please contact us immediately.</p>
                            <br>
                            <p>Best regards,<br><strong>Worklighter Team</strong></p>
                        </div>
                    `;
                    break;

                case 'friendly':
                    subject = 'Friendly Reminder: COI Renewal';
                    htmlContent = `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <h2 style="color: #0F766E; border-bottom: 2px solid #0F766E; padding-bottom: 10px;">Friendly Reminder</h2>
                            <p>Hi ${vendor.vendorName},</p>
                            <p>This is a friendly reminder that your Certificate of Insurance will be expiring soon.</p>
                            <div style="background-color: #F0FDFA; padding: 15px; border-left: 4px solid #0F766E; margin: 20px 0;">
                                <p style="margin: 0;"><strong>Expiration Date:</strong> ${expirationDateFormatted}</p>
                            </div>
                            <p>We'd appreciate it if you could renew it at your earliest convenience.</p>
                            <p>Thanks for your continued partnership!</p>
                            <br>
                            <p>Warm regards,<br><strong>Worklighter Team</strong></p>
                        </div>
                    `;
                    break;

                default:
                    subject = 'Certificate of Insurance Renewal Reminder';
                    htmlContent = `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                            <h2 style="color: #1F2937; border-bottom: 2px solid #1F2937; padding-bottom: 10px;">COI Renewal Reminder</h2>
                            <p>Dear ${vendor.vendorName},</p>
                            <p>This is a reminder that your Certificate of Insurance is due for renewal.</p>
                            <div style="background-color: #F3F4F6; padding: 15px; border-left: 4px solid #1F2937; margin: 20px 0;">
                                <p style="margin: 0;"><strong>Expiration Date:</strong> ${expirationDateFormatted}</p>
                            </div>
                            <p>Please renew your COI to maintain compliance with our requirements.</p>
                            <p>If you have already renewed, please disregard this message.</p>
                            <br>
                            <p>Best regards,<br><strong>Worklighter Team</strong></p>
                        </div>
                    `;
            }

            const mailOptions = {
                from: `"Worklighter COI Alerts" <${emailConfig.auth.user}>`,
                to: vendor.vendorEmail,
                subject,
                html: htmlContent
            };

            await transporter.sendMail(mailOptions);
        } catch (error) {
            console.error('Error sending vendor reminder email:', {
                error: error.message,
                stack: error.stack,
                vendor: vendor.vendorEmail
            });
            throw error;
        }
    }
}

export default new CoiAlertsService();
