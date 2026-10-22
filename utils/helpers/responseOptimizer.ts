import { DEFAULT_OPTIMIZATION_FIELDS } from '../constants';
import { Utils } from '../utils';

class ResponseOptimizer {

    public getOptimizedUser(user: Record<string, any>, fields: string[]) {
        return Utils.selectFieldsFromObject(user, fields)
    }

    public optimizeResponse(data: Record<string, any> | Record<string, any>[], fields: string[]) {
        fields = fields ?? DEFAULT_OPTIMIZATION_FIELDS;
        if (Array.isArray(data)) {
            return Utils.selectFieldsFromArrayOfObjects(data, fields);
        } else {
            return Utils.selectFieldsFromObject(data, fields);
        }
    }
    
}

export default new ResponseOptimizer();