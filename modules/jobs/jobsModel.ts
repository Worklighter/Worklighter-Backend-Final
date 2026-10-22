import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { IJob, JobFillableFields } from "./jobsInterface";

abstract class JobsModel extends BaseModel<IJob> {

    protected static getFillable(): FillableField[] {
        return JobFillableFields;
    }

    public static create(data: Partial<IJob>): IJob {
        const fillables = this.getFillable();
        return this.fill(data, fillables) as IJob;
    }
}

export default JobsModel;