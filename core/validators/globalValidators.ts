import Joi, { ObjectSchema } from 'joi'
import { NextFunction, Request, Response } from 'express'
import { ValidationError } from '../errors/validation';


export function validateRequestBody(schema: ObjectSchema, req: Request): void {
  const bodyValidationResult = schema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (bodyValidationResult.error) {
    throw new ValidationError(bodyValidationResult.error);
  }

  req['validatedBody'] = bodyValidationResult.value;
}

export function validateRequestBodyViaMiddleware(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userUtcOffset = Array.isArray(req.headers['utc-offset']) ? req.headers['utc-offset'][0] : req.headers['utc-offset'];
    const bodyValidationViaMiddlewareResult = schema.validate(req.body, {
      context: { role: req.user?.role, userUtcOffset },
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (bodyValidationViaMiddlewareResult.error) {
      throw new ValidationError(bodyValidationViaMiddlewareResult.error);
    }

    req['validatedBody'] = bodyValidationViaMiddlewareResult.value;
    next();
  };
}

export function validateRequestQuery(schema: ObjectSchema, req: Request): void {
  const queryValidationResult = schema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (queryValidationResult.error) throw new ValidationError(queryValidationResult.error);

  req['validatedQuery'] = queryValidationResult.value;
}

export function validateRequestQueryViaMiddleware(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userUtcOffset = Array.isArray(req.headers['utc-offset']) ? req.headers['utc-offset'][0] : req.headers['utc-offset'];
    const queryValidationViaMiddlewareResult = schema.validate(req.query, {
      context: { role: req.user?.role, userUtcOffset },
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (queryValidationViaMiddlewareResult.error) throw new ValidationError(queryValidationViaMiddlewareResult.error);

    req['validatedQuery'] = queryValidationViaMiddlewareResult.value;

    next();
  };
}

export function validateRequestParams(schema: ObjectSchema, req: Request): void {
  const paramValidationResult = schema.validate(req.params, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (paramValidationResult.error) throw new ValidationError(paramValidationResult.error);

  req['validatedParams'] = paramValidationResult.value;
}

export function validateRequestParamsViaMiddleware(schema: Joi.ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userUtcOffset = Array.isArray(req.headers['utc-offset']) ? req.headers['utc-offset'][0] : req.headers['utc-offset'];
    const paramValidationViaMiddlewareResult = schema.validate(req.params, {
      context: { role: req.user?.role, userUtcOffset },
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (paramValidationViaMiddlewareResult.error) throw new ValidationError(paramValidationViaMiddlewareResult.error);

    req['validatedParams'] = paramValidationViaMiddlewareResult.value;
    next();
  };
}
