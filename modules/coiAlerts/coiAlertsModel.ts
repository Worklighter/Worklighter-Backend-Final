import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { ICoiVendor, CoiVendorFillableFields } from "./coiAlertsInterface";

abstract class CoiVendorModel extends BaseModel<ICoiVendor> {
    protected static getFillable(): FillableField[] {
        return CoiVendorFillableFields;
    }

    public static create(data: Partial<ICoiVendor>): Partial<ICoiVendor> {
        const fillables = this.getFillable();
        return this.fill(data, fillables);
    }
}

export default CoiVendorModel;
