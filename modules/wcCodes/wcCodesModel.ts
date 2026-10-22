import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { IWCCode, WCCodesFillableFields } from "./wcCodesInterface";

abstract class WCCodesModel extends BaseModel<IWCCode> {

    protected static getFillable(): FillableField[] {
        return WCCodesFillableFields;
    }

    public static create(data: Partial<IWCCode>): IWCCode {
        const fillables = this.getFillable();
        return this.fill(data, fillables) as IWCCode;
    }
}

export default WCCodesModel;
