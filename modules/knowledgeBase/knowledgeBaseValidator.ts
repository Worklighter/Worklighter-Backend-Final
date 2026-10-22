import Joi from "joi";
import CodeTypes from "../../core/enums/codeTypes";

const filterValueSchema = Joi.alternatives().try(
    Joi.string().trim().max(255),
    Joi.number(),
    Joi.boolean(),
    Joi.array().items(Joi.alternatives().try(
        Joi.string().trim().max(255),
        Joi.number(),
        Joi.boolean(),
    )).max(50)
);

const knowledgeBaseFilterQuerySchema = Joi.object({
    code: filterValueSchema.optional(),
    codeNumber: filterValueSchema.optional(),
    code_number: filterValueSchema.optional(),
    codeType: filterValueSchema.optional(),
    code_type: filterValueSchema.optional(),
    documentId: filterValueSchema.optional(),
    document_id: filterValueSchema.optional(),
    documentName: filterValueSchema.optional(),
    document_name: filterValueSchema.optional(),
}).unknown(false);

export const createKnowledgeBaseSchema = Joi.object({
    title: Joi.string().trim().max(255).required().messages({
        'any.required': 'Title is required',
    }),
    content: Joi.array().items(Joi.object({
        code: Joi.string().trim().max(255).required(),
        type: Joi.string().valid(...Object.values(CodeTypes)).required(),
        title: Joi.string().trim().max(255).required(),
        description: Joi.string().trim().max(2000).required(),
    })).optional().max(100),
});

export const getKnowledgeBaseByIdSchema = Joi.object({
    id: Joi.string().required().messages({
        'any.required': 'Knowledge base ID is required',
    }),
});

export const listKnowledgeBaseSchema = Joi.object({
    continuationToken: Joi.number().integer().min(0).optional().default(0),
    pageSize: Joi.number().integer().min(1).max(100).optional().default(15),
});

export const searchKnowledgeBaseSchema = Joi.object({
    query: Joi.string().trim().min(1).max(2000).required(),
    k: Joi.number().integer().min(1).max(50).optional().default(8),
    filterQuery: knowledgeBaseFilterQuerySchema.optional(),
});

export const askKnowledgeBaseSchema = Joi.object({
    question: Joi.string().trim().min(1).max(5000).required(),
    k: Joi.number().integer().min(1).max(50).optional().default(8),
    filterQuery: knowledgeBaseFilterQuerySchema.optional(),
});

export const deleteKnowledgeBaseSchema = Joi.object({
    id: Joi.string().required().messages({
        'any.required': 'Knowledge base ID is required',
    }),
});
