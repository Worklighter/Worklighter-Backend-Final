import express, { Express } from 'express';
import stoppable from 'stoppable';
import * as http from 'http';
import cors from 'cors';
import { Logger } from '../utils/helpers/logger';

//& ROUTES
import * as AuthRoutes from '../routes/auth'
import * as ApiRoutes from '../routes/api'
import * as SystemRoutes from '../routes/system'
import WebhookRoutes from '../modules/webhooks/webhooksController';
import ErrorHandler from '../utils/helpers/errorHandler';

import { CorsConfig } from '../configurations/cors';
import { Application } from '../app';

import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { HelmetConfig } from '../configurations/helmet';
import { RateLimitConfig } from '../configurations/ratelimiter';
import rateLimit from 'express-rate-limit';
import { wrapRoutesWithAsyncHandler } from '../utils/helpers/asyncHandler';
import { notFoundMiddleware } from '../middlewares/notFoundMiddleware';
import { IHttpConf } from '../core/interfaces/httpConf';
import path from 'path';

export class HTTPServer {

    public static server: HTTPServer;
    public static conf: IHttpConf;
    private readonly app: Express;
    private httpServer!: http.Server & stoppable.WithStop;

    private constructor() {
        this.app = express();
    }

    static async INIT(conf: IHttpConf): Promise<HTTPServer> {
        if (!HTTPServer.server) {
            HTTPServer.conf = conf;
            HTTPServer.server = new HTTPServer();
            HTTPServer.RegisterRouter();
            HTTPServer.StartServer(Application.conf.PORT);
            return HTTPServer.server;
        } else return HTTPServer.server;
    }

    static RegisterRouter() {
        const app = this.server.app;

        app.set('trust proxy', 1);

        app.use(helmet(HelmetConfig.getConfig(Application.conf.ENV)));
        app.use(cors(CorsConfig.getConfig(Application.conf.ENV)));
        app.use(rateLimit(RateLimitConfig.getDefaultRateLimit(Application.conf.ENV)));

        app.use(cookieParser());
        app.use('/api/v1/subscriptions/webhook', express.raw({ type: 'application/json' }));
        app.use(express.json());
        app.use(express.urlencoded({ extended: false }));

        app.use('/webhooks', wrapRoutesWithAsyncHandler(WebhookRoutes));
        app.use('/uploads/profile-pictures', express.static(path.join(__dirname, '../uploads/profile-pictures')));
        app.use('/api', wrapRoutesWithAsyncHandler(ApiRoutes.router));
        app.use('/auth', wrapRoutesWithAsyncHandler(AuthRoutes.router));
        app.use('/system', wrapRoutesWithAsyncHandler(SystemRoutes.router));

        app.use('/', notFoundMiddleware);
        app.use(ErrorHandler);
    }

    static StartServer(port: number) {
        this.server.httpServer = stoppable(
            this.server.app.listen(port, () => {
                Logger.Console(`Server Started on Port : ${port}`, 'info');
            })
        );

        this.server.httpServer.on('close', () => {
            console.log('Server Close Fired');
            process.exit(1);
        });
    }

    static async StopServer() {
        console.log('Stopping Server');
        try {
            if (!this.server) process.exit(1);
            this.server.httpServer.close();
        } catch (error) {
            console.error(`An error occurred while stopping server: CAUSE: ${error}`);
        }
    }

}
