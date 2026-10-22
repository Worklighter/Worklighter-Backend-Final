import { Request, Response, NextFunction, Router } from 'express';

export const wrapAsync = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};


export const wrapRoutesWithAsyncHandler = (router: Router) => {
    router.stack.forEach((layer) => {
        if (layer.route) {
            layer.route.stack.forEach((routeLayer) => {
                const originalHandler = routeLayer.handle;
                routeLayer.handle = wrapAsync(originalHandler);
            });
        }
    });
    return router;
};