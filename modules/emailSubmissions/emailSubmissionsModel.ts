import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { IEmailSubmissions, EmailSubmissionFillableFields } from "./emailSubmissionsInterface";

abstract class EmailSubmissionsModel extends BaseModel<IEmailSubmissions> {

    protected static getFillable(): FillableField[] {
        return EmailSubmissionFillableFields;
    }


    public static create(data: Partial<IEmailSubmissions>): IEmailSubmissions {
        const fillables = this.getFillable();
        return this.fill(data, fillables);
    }

}


export default EmailSubmissionsModel;
