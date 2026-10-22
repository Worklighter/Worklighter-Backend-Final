import { HttpStatusCode } from "axios";
import { ObjectId } from "mongodb";
import QueryOperators from "../../core/enums/queryOperators";
import { CustomError } from "../../core/errors/custom";
import IJWTPayload from "../../core/interfaces/jwt";
import { Utils } from "../../utils/utils";
import {
    ICoiAlertConfig,
    IUpdateAlertConfigDTO,
    IAlertSchedule,
    alertConfigResponseFields
} from "./coiConfigsInterface";
import CoiAlertConfigRepository from "./coiConfigsRepository";
import CoiConfigsModel from "./coiConfigsModel";

class CoiConfigsService {
    public async getAlertConfig(loggedInUser: IJWTPayload): Promise<ICoiAlertConfig> {
        let config = await CoiAlertConfigRepository.getInstance().GetOneByParams<ICoiAlertConfig>([
            { param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND }
        ], alertConfigResponseFields);

        if (!config) {
            config = await this.createDefaultAlertConfig(loggedInUser);
        }

        return config;
    }

    public async updateAlertConfig(data: IUpdateAlertConfigDTO, loggedInUser: IJWTPayload): Promise<ICoiAlertConfig> {
        let config = await CoiAlertConfigRepository.getInstance().GetOneByParams([
            { param: 'tenantId', value: loggedInUser.tenantId, operator: QueryOperators.AND }
        ], ['_id']);

        const updateData: any = {
            updatedAt: Utils.getCurrentDate()
        };

        if (data.externalSchedules) {
            updateData.externalSchedules = data.externalSchedules.map(schedule => ({
                id: schedule.id || new ObjectId().toHexString(),
                days: schedule.days,
                enabled: schedule.enabled !== undefined ? schedule.enabled : true
            }));
        }

        if (data.internalSchedules) {
            updateData.internalSchedules = data.internalSchedules.map(schedule => ({
                id: schedule.id || new ObjectId().toHexString(),
                days: schedule.days,
                enabled: schedule.enabled !== undefined ? schedule.enabled : true
            }));
        }

        if (data.externalAlertMode !== undefined) updateData.externalAlertMode = data.externalAlertMode;
        if (data.sendFinalAlertOnExpiration !== undefined) updateData.sendFinalAlertOnExpiration = data.sendFinalAlertOnExpiration;
        if (data.internalAlertMode !== undefined) updateData.internalAlertMode = data.internalAlertMode;
        if (data.internalCCRecipients !== undefined) updateData.internalCCRecipients = data.internalCCRecipients;
        if (data.sendFinalInternalAlert !== undefined) updateData.sendFinalInternalAlert = data.sendFinalInternalAlert;

        let updatedConfig: ICoiAlertConfig;

        if (config) {
            updatedConfig = await CoiAlertConfigRepository.getInstance().Update<ICoiAlertConfig>(
                new ObjectId((config as { _id: string })._id),
                updateData,
                alertConfigResponseFields
            );
        } else {
            const configData: Partial<ICoiAlertConfig> = {
                ...updateData,
                tenantId: loggedInUser.tenantId,
                userId: loggedInUser.id,
                externalAlertMode: data.externalAlertMode || 'manual',
                externalSchedules: updateData.externalSchedules || [],
                sendFinalAlertOnExpiration: data.sendFinalAlertOnExpiration !== undefined ? data.sendFinalAlertOnExpiration : true,
                internalAlertMode: data.internalAlertMode || 'manual',
                internalSchedules: updateData.internalSchedules || [],
                internalCCRecipients: data.internalCCRecipients || [],
                sendFinalInternalAlert: data.sendFinalInternalAlert !== undefined ? data.sendFinalInternalAlert : true,
                createdAt: Utils.getCurrentDate()
            };

            const model = CoiConfigsModel.create(configData);
            updatedConfig = await CoiAlertConfigRepository.getInstance().Add<ICoiAlertConfig>(
                model,
                alertConfigResponseFields
            );
        }

        return updatedConfig;
    }

    public async addExternalSchedule(days: number[], loggedInUser: IJWTPayload): Promise<ICoiAlertConfig> {
        const config = await this.getAlertConfig(loggedInUser);

        const existingSchedules = config.externalSchedules || [];
        const existingDays = new Set(existingSchedules.map(s => s.days));
        const uniqueDays = Array.from(new Set(days));

        if (uniqueDays.some(day => existingDays.has(day))) {
            throw new CustomError(HttpStatusCode.Conflict, 'A schedule with this number of days already exists');
        }

        const newSchedules: IAlertSchedule[] = uniqueDays.map(day => ({
            id: new ObjectId().toHexString(),
            days: day,
            enabled: true
        }));

        existingSchedules.push(...newSchedules);

        return await this.updateAlertConfig(
            { externalSchedules: existingSchedules },
            loggedInUser
        );
    }

    public async removeExternalSchedule(scheduleId: string, loggedInUser: IJWTPayload): Promise<ICoiAlertConfig> {
        const config = await this.getAlertConfig(loggedInUser);

        const existingSchedules = config.externalSchedules || [];
        const filteredSchedules = existingSchedules.filter(s => s.id !== scheduleId);

        if (filteredSchedules.length === existingSchedules.length) {
            throw new CustomError(HttpStatusCode.NotFound, 'Schedule not found');
        }

        return await this.updateAlertConfig(
            { externalSchedules: filteredSchedules },
            loggedInUser
        );
    }

    public async addInternalSchedule(days: number[], loggedInUser: IJWTPayload): Promise<ICoiAlertConfig> {
        const config = await this.getAlertConfig(loggedInUser);

        const existingSchedules = config.internalSchedules || [];
        const existingDays = new Set(existingSchedules.map(s => s.days));
        const uniqueDays = Array.from(new Set(days));

        if (uniqueDays.some(day => existingDays.has(day))) {
            throw new CustomError(HttpStatusCode.Conflict, 'A schedule with this number of days already exists');
        }

        const newSchedules: IAlertSchedule[] = uniqueDays.map(day => ({
            id: new ObjectId().toHexString(),
            days: day,
            enabled: true
        }));

        existingSchedules.push(...newSchedules);

        return await this.updateAlertConfig(
            { internalSchedules: existingSchedules },
            loggedInUser
        );
    }

    public async removeInternalSchedule(scheduleId: string, loggedInUser: IJWTPayload): Promise<ICoiAlertConfig> {
        const config = await this.getAlertConfig(loggedInUser);

        const existingSchedules = config.internalSchedules || [];
        const filteredSchedules = existingSchedules.filter(s => s.id !== scheduleId);

        if (filteredSchedules.length === existingSchedules.length) {
            throw new CustomError(HttpStatusCode.NotFound, 'Schedule not found');
        }

        return await this.updateAlertConfig(
            { internalSchedules: filteredSchedules },
            loggedInUser
        );
    }

    public async addCCRecipient(email: string, loggedInUser: IJWTPayload): Promise<ICoiAlertConfig> {
        const config = await this.getAlertConfig(loggedInUser);

        const existingRecipients = config.internalCCRecipients || [];
        if (existingRecipients.includes(email)) {
            throw new CustomError(HttpStatusCode.Conflict, 'This recipient already exists');
        }

        existingRecipients.push(email);

        return await this.updateAlertConfig(
            { internalCCRecipients: existingRecipients },
            loggedInUser
        );
    }

    public async removeCCRecipient(email: string, loggedInUser: IJWTPayload): Promise<ICoiAlertConfig> {
        const config = await this.getAlertConfig(loggedInUser);

        const existingRecipients = config.internalCCRecipients || [];
        const filteredRecipients = existingRecipients.filter(e => e !== email);

        if (filteredRecipients.length === existingRecipients.length) {
            throw new CustomError(HttpStatusCode.NotFound, 'Recipient not found');
        }

        return await this.updateAlertConfig(
            { internalCCRecipients: filteredRecipients },
            loggedInUser
        );
    }

    private async createDefaultAlertConfig(loggedInUser: IJWTPayload): Promise<ICoiAlertConfig> {
        const defaultConfig: Partial<ICoiAlertConfig> = {
            tenantId: loggedInUser.tenantId,
            userId: loggedInUser.id,
            externalAlertMode: 'manual',
            externalSchedules: [],
            sendFinalAlertOnExpiration: true,
            internalAlertMode: 'manual',
            internalSchedules: [],
            internalCCRecipients: [],
            sendFinalInternalAlert: true,
            createdAt: Utils.getCurrentDate()
        };

        const model = CoiConfigsModel.create(defaultConfig);
        return await CoiAlertConfigRepository.getInstance().Add<ICoiAlertConfig>(
            model,
            alertConfigResponseFields
        );
    }
}

export default new CoiConfigsService();
