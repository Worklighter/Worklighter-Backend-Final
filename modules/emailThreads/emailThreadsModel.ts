import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { IEmailThreads, EmailThreadFillableFields } from "./emailThreadsInterface";

abstract class EmailThreadsModel extends BaseModel<IEmailThreads> {

    protected static getFillable(): FillableField[] {
        return EmailThreadFillableFields;
    }


    public static create(data: Partial<IEmailThreads>): IEmailThreads {
        const fillables = this.getFillable();
        return this.fill(data, fillables);
    }

}



export default EmailThreadsModel;