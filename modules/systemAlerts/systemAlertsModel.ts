import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { ISystemAlerts, SystemAlertsFillableFields } from "./systemAlertsInterface";

abstract class SystemAlertsModel extends BaseModel<ISystemAlerts> {

    protected static getFillable(): FillableField[] {
        return SystemAlertsFillableFields;
    }


    public static create(data: Partial<ISystemAlerts>): ISystemAlerts {
        const fillables = this.getFillable();
        return this.fill(data, fillables);
    }

}


export default SystemAlertsModel;