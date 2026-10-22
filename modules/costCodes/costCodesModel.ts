import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { ICostCode, CostCodeFillableFields } from "./costCodesInterface";

abstract class CostCodesModel extends BaseModel<ICostCode> {

    protected static getFillable(): FillableField[] {
        return CostCodeFillableFields;
    }

    public static create(data: BaseModel<ICostCode>): ICostCode {
        const fillables = this.getFillable();
        return this.fill(data, fillables);
    }

}

export default CostCodesModel;
