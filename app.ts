import { DBConfig, DBConfigMongo } from './configurations/database';
import { LoggerConf } from './configurations/logger';
import RedisConfig, { IRedisConfig } from './configurations/redis';
import MongoDatabase from './database/database';
// import EmailService from './integration/emailService';
import EmailSubmissionsRepository from './modules/emailSubmissions/emailSubmissionsRepository';
import { HTTPServer } from './server/http';
import { Logger } from './utils/helpers/logger';
import { Utils } from './utils/utils';
import colors from 'colors';
import { IAppConfig, AsymmetricEncryption, AESEncryptionModes } from './core/interfaces/appConfig';
import IEnvironment from './core/interfaces/environment';
import IJWTPayload from './core/interfaces/jwt';
// import EmailsJobProcessor from './core/jobs/emailsJobProcessor';
import EmailsRepository from './modules/emails/emailsRepository';
// import EmailTemplatesRepository from './modules/emailTemplates/emailTemplatesRepository';
import EmailThreadsRepository from './modules/emailThreads/emailThreadsRepository';
import RolesRepository from './modules/roles/rolesRepositories';
import SystemAlertsRepository from './modules/systemAlerts/systemAlertsRepository';
import UsersRepository from './modules/users/usersRepository';
import OnboardingRepository from './modules/company/companyRepository';
import EmailService from './integration/emailService';
import OtpRepository from './modules/otp/otpRepository';
import JobsRepository from './modules/jobs/jobsRepository';
import EmailTemplatesRepository from './modules/emailTemplates/emailTemplatesRepository';
import CostCodesRepository from './modules/costCodes/costCodesRepository';
import WCCodesRepository from './modules/wcCodes/wcCodesRepository';
import { PlansRepository } from './modules/plans/plansRepository';
import AzureBlobStorage from './integration/azure/azureBlobStorage';
import { AzureMediaStorageServiceConfig, AzureDocumentIntelligenceServiceConfig, ServicesConfig } from './configurations/services';
import MediaStorageService from './utils/services/mediaStorage';
import CoiVendorsRepository from './modules/coiAlerts/coiAlertsRepository';
import CoiAlertConfigRepository from './modules/coiConfigs/coiConfigsRepository';
import AuditLogsRepository from './modules/auditLogs/auditLogsRepository';
import KnowledgeBaseRepository from './modules/knowledgeBase/knowledgeBaseRepository';
import Redis from './integration/redis';
import EmailsJobProcessor from './core/jobs/emailsJobProcessor';
import KnowledgeBaseJobProcessor from './core/jobs/knowledgeBaseJobProcessor';
import { AzureDocumentIntelligenceService } from './integration/azure/docIntelligence';
import AzureAISearch from './integration/azure/aiSearch';
import CoiExpiringSoonAlertsCron from './core/jobs/coiExpiringSoonAlertsCron';
import StripeService from './integration/stripe';
import StripeConfig from './configurations/stripe';
import SubscriptionsRepository from './modules/subscriptions/subscriptionsRepository';
import TransactionHistoryRepository from './modules/transactionHistory/transactionHistoryRepository';
import IssuedTokensRepository from './modules/issuedTokens/issuedTokensRepository';



declare global {
    namespace NodeJS {
        interface Global {
            __rootdir__: string;
            servicename: string;
            environment: string;
            logger: string;
            delayStart: number;
            __templateURL: string;
        }
    }
}

declare module 'express-serve-static-core' {
    interface Request {
        user?: IJWTPayload;
        token?: string;
        validatedBody: any;
        validatedQuery: any;
        validatedParams: any;
    }
}

global.__rootdir__ = process.cwd();

export class Application {

    public static conf: IAppConfig;
    public static jwtEncryption: AsymmetricEncryption;
    public static aesEncryption: AESEncryptionModes;
    public static dbConfMongo: DBConfigMongo;
    public static redisConf: IRedisConfig;
    public static started: boolean = false;

    private httpServer: HTTPServer;


    public static mediaStorageServiceConf: AzureMediaStorageServiceConfig;
    public static documentIntelligenceServiceConf: AzureDocumentIntelligenceServiceConfig;
    private azureBlobStorage = AzureBlobStorage.getInstance();
    private mediaStorageService = MediaStorageService.getInstance();

    public async INIT(env: IEnvironment) {
        this.setupGlobalHandlers();
        this.setupGracefulShutdown(env.config.GracefullShutdown);

        try {
            this.initializeGlobals(env);
            await this.loadConfigurations();

            if (!env.config.VAULT) {
                await this.setupApplicationInfrastructure();
            }

            await this.delayStartIfNeeded(global.delayStart);
            this.setTemplateURL(env.config.services);

            this.httpServer = await this.initializeHTTPServer(env.config);

            Object.seal(this.httpServer);
            Application.started = true;

        } catch (error) {
            Logger.Console(error, 'error');
            Logger.Console('Error occurred while initializing application');
        }
    }

    private setupGlobalHandlers() {
        process.on('unhandledRejection', ex => {
            Logger.Log('Unhandled Rejection !!!!!', 'critical');
            Logger.Log(ex, 'critical');
        });

        process.on('uncaughtException', ex => {
            Logger.Log('Uncaught Exception !!!!!', 'critical');
            Logger.Log(ex, 'critical');
        });
    }

    private setupGracefulShutdown(enableGracefulShutdown: boolean) {
        if (!enableGracefulShutdown) return;

        process.on('SIGINT', async code => {
            await this.handleShutdown('SIGINT', code);
        });

        process.on('SIGTERM', async () => {
            await this.handleShutdown('SIGTERM');
        });
    }

    private async handleShutdown(signal: string, code?: string) {
        try {
            if (!Application.started) process.exit(1);
            console.log(signal, code || '');
            await HTTPServer.StopServer();
        } catch (error) {
            Logger.Log(error, 'critical');
            process.exit(1);
        }
    }

    private initializeGlobals(env: IEnvironment) {
        Logger.CreateLogger(LoggerConf.colors);
        global.servicename = env.config.ServiceName;
        global.environment = env.env;
        global.logger = env.logger;
        global.delayStart = env.delayStart;

        if (!env.config.ServiceName) {
            throw new Error('Unknown Service Name');
        }
    }

    private async loadConfigurations() {
        Application.conf = await Utils.LoadEnv();
        Application.mediaStorageServiceConf = ServicesConfig.GetMediaStorageServiceConf();
        Application.documentIntelligenceServiceConf = ServicesConfig.GetDocumentIntelligenceServiceConf();
        Application.dbConfMongo = DBConfig.GetDbConf('mongo');
        Application.redisConf = RedisConfig.GetRedisConf();
        console.log(colors.blue('################################'));
        console.log(colors.blue('SERVER AND CONFIGURATIONS DETAIL'.blue));
        console.log(colors.blue('################################'));
        console.log(colors.america(`ENVIRONMENT --> ${global.environment}`));
        console.log(colors.cyan(`DATABASE --> ${Application.dbConfMongo.dbname}\tHOST --> ${Application.dbConfMongo.host}`));
        await this.mediaStorageService.init(Application.mediaStorageServiceConf);
        this.azureBlobStorage.init(this.mediaStorageService.getBlobServiceClient(), Application.mediaStorageServiceConf.IMAGES_CONTAINER_NAME)
    }

    private async setupApplicationInfrastructure() {
        await this.setupDatabase();
        await this.setupRepositories();
        await this.setupServices();
        await this.setupBackgroundJobs();
        await this.setupCronJobs();
    }

    private async setupDatabase() {
        await MongoDatabase.connect(Application.dbConfMongo);
    }

    private async setupServices() {
        Application.jwtEncryption = Application.conf.ENCRYPTION.jwt;
        Application.aesEncryption = Application.conf.ENCRYPTION.aesEncryption;
        await Redis.getInstance().init(Application.redisConf);
        await EmailService.getInstance().init(Application.conf.SERVICES.email.nodeMailer);
        await StripeService.getInstance().init(StripeConfig.GetStripeConf());
        await AzureDocumentIntelligenceService.init(Application.documentIntelligenceServiceConf);

        // Best-effort: ensure Knowledge Base vector index exists on startup (do not block app boot if unset)
        try {
            await AzureAISearch.getInstance().ensureCodesIndexExists();
        } catch (error: any) {
            Logger.Console(`Azure AI Search KB index bootstrap skipped: ${error?.message || error}`, 'warn');
        }
    }

    private async setupRepositories() {
        await UsersRepository.getInstance().INIT();
        await OnboardingRepository.getInstance().INIT();
        await OtpRepository.getInstance().INIT();
        await JobsRepository.getInstance().INIT();
        // await MenusRepository.getInstance().INIT();
        await RolesRepository.getInstance().INIT();
        await EmailsRepository.getInstance().INIT();
        await CostCodesRepository.getInstance().INIT();
        await WCCodesRepository.getInstance().INIT();
        await CoiVendorsRepository.getInstance().INIT();
        await CoiAlertConfigRepository.getInstance().INIT();
        // await PermissionsRepository.getInstance().INIT();
        await EmailSubmissionsRepository.getInstance().INIT();
        await EmailThreadsRepository.getInstance().INIT();
        await SystemAlertsRepository.getInstance().INIT();
        await EmailTemplatesRepository.getInstance().INIT();
        await PlansRepository.getInstance().INIT();
        await AuditLogsRepository.getInstance().INIT();
        await KnowledgeBaseRepository.getInstance().INIT();
        await SubscriptionsRepository.getInstance().INIT();
        await TransactionHistoryRepository.getInstance().INIT();
        await IssuedTokensRepository.getInstance().INIT();
    }

    private async setupBackgroundJobs() {
        // //* EMAIL JOBS
        await EmailsJobProcessor.getInstance().initQueues();
        await EmailsJobProcessor.getInstance().initWorkers();

        // //* KNOWLEDGE BASE JOBS
        await KnowledgeBaseJobProcessor.getInstance().initQueues();
        await KnowledgeBaseJobProcessor.getInstance().initWorkers();
    }

    private async setupCronJobs() {
        CoiExpiringSoonAlertsCron.getInstance().start();
    }

    private async delayStartIfNeeded(delay: number) {
        if (delay) await Utils.Sleep(delay);
    }

    private setTemplateURL(services: any) {
        if (!services) return;

        const productService = services['product'];
        if (!productService) return;

        const protocol = productService.protocol;
        const host = productService.host;
        const port = productService.port ? `:${productService.port}` : '';

        global.__templateURL = `${protocol}://${host}${port}`;
    }

    private async initializeHTTPServer(config: any) {
        return HTTPServer.INIT(config);
    }

}
