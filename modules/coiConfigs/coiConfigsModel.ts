import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { ICoiAlertConfig, CoiAlertConfigFillableFields } from "./coiConfigsInterface";

abstract class CoiConfigsModel extends BaseModel<ICoiAlertConfig> {

    protected static getFillable(): FillableField[] {
        return CoiAlertConfigFillableFields;
    }

    public static create(data: Partial<ICoiAlertConfig>): Partial<ICoiAlertConfig> {
        const fillables = this.getFillable();
        return this.fill(data, fillables);
    }
}

export default CoiConfigsModel;
