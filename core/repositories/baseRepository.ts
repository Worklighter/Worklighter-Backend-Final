import { Collection, ObjectId } from "mongodb";
import MongoDatabase from "../../database/database";
import { Logger } from "../../utils/helpers/logger";
import QueryOperationTypes from "../enums/queryOperationTypes";
import { PAGE, PER_PAGE } from "../../utils/constants";
import { Utils } from "../../utils/utils";


class BaseRepository {
    protected collectionName: string;
    private db: any;
    protected relations: any;
    public collection: Collection;


    constructor(collectionName: string, relation = []) {
        this.collectionName = collectionName;
        this.relations = relation;
    }

    protected async INIT() {
        let initializeCollection = new Promise((resolve, reject) => {
            MongoDatabase.db.subscribe(async (val: any) => {
                this.db = val;
                if (val) {
                    try {
                        this.collection = await this.db.createCollection(this.collectionName);
                        resolve("Collection created");
                    } catch (error: any) {
                        if (error.code == 48) {
                            this.collection = this.db.collection(this.collectionName);
                            if (this.collection) {
                                console.log(
                                    "Collection loaded: ",
                                    this.collection.collectionName
                                );
                                resolve("Existing collection loaded");
                            }
                            reject(new Error("Unknown error in collection"));
                        } else {
                            Logger.Console('Failed to connect to mongodb: ' + error.message, 'error');
                            reject(new Error("Error in creating collection"));
                        }
                    }
                }
            });
        });

        return initializeCollection;
    }


    public async Add<T>(data: Record<string, any>, columns: string[] = []) {
        try {
            let doc = await this.collection.insertOne(data);
            if (columns.length) {
                const projection = this.constructProjection(columns);
                return await this.collection.findOne(doc.insertedId, { projection }) as T;
            }
            return await this.collection.findOne(doc.insertedId) as T;
        } catch (error: any) {
            console.error('An error occurred while inserting record', error);
            throw new Error(error);
        }
    }


    public async AddMany(data: Record<string, any>[], columns: string[] = []) {
        try {
            let docs = await this.collection.insertMany(data);
            const insertedIds = Object.values(docs.insertedIds);

            if (columns.length) {
                const projection = this.constructProjection(columns);
                return await this.collection.find({ _id: { $in: insertedIds } }).project(projection).toArray();
            }

            return await this.collection.find({ _id: { $in: insertedIds } }).toArray();
        } catch (error: any) {
            console.error('An error occurred while inserting multiple records', error);
            throw new Error(error);
        }
    }


    public async Update<T>(id: ObjectId, data: Record<string, any>, columns: string[] = []): Promise<T | null> {
        try {
            await this.collection.updateOne({ _id: id }, { $set: data });
            const projection = columns.length ? Object.fromEntries(columns.map(col => [col, 1])) : {};
            return await this.collection.findOne<T>({ _id: id }, { projection });
        } catch (error: any) {
            console.error('An error occurred while updating record', error);
            throw new Error(error);
        }
    }




    public async UpdateMany(parameters: { param: string, value: string | number | boolean | Record<string, string | number | boolean> | Record<string, any>[], operator: 'AND' | 'OR', operationType?: 'equals' | 'contains' | 'in' | 'not_in' | 'array_contains', caseSensitive?: boolean }[], data: Record<string, any>) {
        try {
            let filter = { deletedAt: null };
            filter = { ...filter, ...this.constructConditionalClauses(parameters) };
            return await this.collection.updateMany(
                filter,
                { $set: data }
            );
        } catch (error: any) {
            console.error('An error occurred while updating the records', error);
            throw new Error(error);
        }
    }


    public async GetById<T>(id: string, columns: string[]) {
        try {
            const projection = this.constructProjection(columns);
            const filter = { _id: new ObjectId(id), deletedAt: null }
            return await this.collection.findOne(filter, { projection }) as T;
        } catch (error: any) {
            console.error('An error occurred while retrieving the record by id', error);
            throw new Error(error);
        }
    }


    public async GetOneByParam<T>(
        filter: { param: string, value: any },
        columns?: string[]
    ): Promise<T | null> {
        try {
            const queryFilter = {
                [filter.param]: filter.value
            };

            let projection = {};
            if (columns && columns.length > 0) {
                projection = this.constructProjection(columns);
            }

            return await this.collection.findOne(queryFilter, { projection }) as T;
        } catch (error: any) {
            console.error('An error occurred while retrieving the record by param', error);
            throw new Error(error);
        }
    }


    public async GetOneByParams<T>(
        parameters: {
            param: string;
            value: string | number | boolean | Record<string, string | number | boolean> | Record<string, any>[] | ObjectId;
            operator: 'AND' | 'OR';
            operationType?: 'equals' | 'contains' | 'in' | 'not_in' | 'array_contains' | 'not_equals';
            caseSensitive?: boolean;
        }[],
        columns?: string[]
    ): Promise<T | null> {
        try {
            const projection = columns ? this.constructProjection(columns) : undefined;
            let filters: Record<string, any> = { deletedAt: null };
            filters = { ...filters, ...this.constructConditionalClauses(parameters) };
            return await this.collection.findOne<T>(filters, { projection });
        } catch (error: any) {
            console.error('An error occurred while retrieving the record by params', error);
            throw new Error(error);
        }
    }




    public async GetAll<T>(
        parameters: {
            param: string;
            value: string | number | boolean | Record<string, string | number | boolean> | Record<string, any>[];
            operator: 'AND' | 'OR';
            operationType?: QueryOperationTypes;
            caseSensitive?: boolean;
        }[] = [],
        paginate: boolean = false,
        continuationToken: any = null,
        pageSize: number = PER_PAGE,
        orderBy: Record<string, 1 | -1> = { _id: 1 },
        columns: string[] = [],
    ) {
        try {
            if (!orderBy || Object.keys(orderBy).length === 0) {
                orderBy = { _id: 1 };
            }

            let filters: any = { deletedAt: null };

            if (parameters.length) {
                filters = { ...filters, ...this.constructConditionalClauses(parameters) };
            }

            const projection = this.constructProjection(columns);
            const queryOptions: any = { filter: filters, projection };

            if (paginate) {
                let newContinuationToken = null;

                const currentPage = parseInt(continuationToken) || PAGE;

                const { skip, limit } = Utils.CalcPagination(currentPage, pageSize);

                let result = await this.collection
                    .find(queryOptions.filter, { projection })
                    .sort(orderBy)
                    .skip(skip)
                    .limit(limit + 1)
                    .toArray();

                if (result.length > pageSize) {
                    result.pop();
                    newContinuationToken = `${currentPage + 1}`;
                }

                return { data: result, continuationToken: newContinuationToken } as T;
            }
            else {
                let result = await this.collection
                    .find(queryOptions.filter, { projection })
                    .sort(orderBy)
                    .toArray();

                return result as T;
            }

        } catch (error: any) {
            console.error('An error occurred while retrieving the records', error);
            throw new Error(error.message);
        }
    }



    public async SoftDelete(id: string) {
        try {
            const _id = new ObjectId(id);
            return await this.collection.updateOne(
                { _id },
                { $set: { deletedAt: Utils.getCurrentDate() } },
            );
        } catch (error: any) {
            console.error('An error occurred while deleting the record', error);
            throw new Error(error);
        }
    }


    public async HardDelete(id: string) {
        try {
            const _id = new ObjectId(id);
            return await this.collection.deleteOne({ _id });
        } catch (error: any) {
            console.error('An error occurred while deleting the record', error);
            throw new Error(error);
        }
    }

    public async Count(parameters: { param: string, value: string | number | boolean | Record<string, string | number | boolean> | Record<string, any>[], operator: 'AND' | 'OR', operationType?: 'equals' | 'contains' | 'in' | 'not_in' | 'array_contains' | 'not_equals', caseSensitive?: boolean }[] = []) {
        try {
            let filters = {
                deletedAt: null
            };
            if (parameters.length) {
                filters = { ...filters, ...this.constructConditionalClauses(parameters) };
            }
            const count = await this.collection.countDocuments(filters);
            return count;
        } catch (error: any) {
            throw new Error(error);
        }
    }


    public async customAggregator(pipeline: Array<Record<any, any>>) {
        try {
            const result = await this.collection.aggregate(pipeline).toArray();
            return result;
        } catch (error: any) {
            throw new Error(error);
        }
    }


    //* ============================== PRIVATE FUNCTIONS ============================== *//

    private constructConditionalClauses(
        parameters: { param: string, value: any, operator: 'AND' | 'OR', operationType?: 'equals' | 'contains' | 'in' | 'not_in' | 'array_contains' | 'not_equals', caseSensitive?: boolean }[]
    ) {
        const andConditions: any[] = [];
        const orConditions: any[] = [];

        parameters.forEach((param) => {
            const operationType = param.operationType || 'equals';
            let condition: any;

            switch (operationType) {
                case 'contains': {
                    if (!param.value) return; // Avoid empty regex
                    const regex = param.caseSensitive ? new RegExp(param.value) : new RegExp(param.value, 'i');
                    condition = { [param.param]: { $regex: regex } };
                    break;
                }

                case 'in': {
                    condition = { [param.param]: { $in: Array.isArray(param.value) ? param.value : [param.value] } };
                    break;
                }

                case 'not_in': {
                    condition = { [param.param]: { $nin: Array.isArray(param.value) ? param.value : [param.value] } };
                    break;
                }

                case 'equals': {
                    condition = { [param.param]: param.value };
                    break;
                }

                case 'not_equals': {
                    condition = { [param.param]: { $ne: param.value } };
                    break;
                }

                case 'array_contains': {
                    condition = { [param.param]: { $elemMatch: { $eq: param.value } } };
                    break;
                }

                default: {
                    throw new Error(`Unsupported operation type: ${operationType}`);
                }
            }

            // Group conditions properly
            if (param.operator === 'AND') {
                andConditions.push(condition);
            } else if (param.operator === 'OR') {
                orConditions.push(condition);
            }
        });

        // Return structured query
        if (andConditions.length > 0 && orConditions.length > 0) {
            return { $and: andConditions.concat({ $or: orConditions }) };
        } else if (andConditions.length > 0) {
            return { $and: andConditions };
        } else if (orConditions.length > 0) {
            return { $or: orConditions };
        } else {
            return {};
        }
    }


    public constructProjection(columns: string[]) {
        const projection: { [key: string]: number } = {};
        columns.forEach(column => {
            projection[column] = 1;
        });
        return projection;
    }


    public applyContinuationToken(
        filter: Record<string, any>,
        continuationToken: any,
        orderBy: Record<string, 1 | -1>,
        continuationTokenIdentifier: string
    ): Record<string, any> {
        if (continuationToken) {
            const orderDirection = orderBy[continuationTokenIdentifier] ?? 1;

            const condition = orderDirection === 1
                ? { [continuationTokenIdentifier]: { $gt: continuationToken } }
                : { [continuationTokenIdentifier]: { $lt: continuationToken } };

            filter.$and = filter.$and ? [...filter.$and, condition] : [condition];
        }

        return filter;
    }

}


export default BaseRepository;
