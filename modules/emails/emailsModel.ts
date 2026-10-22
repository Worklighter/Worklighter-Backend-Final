import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { IEmails, EmailFillableFields } from "./emailsInterface";

abstract class EmailsModel extends BaseModel<IEmails> {

    protected static getFillable(): FillableField[] {
        return EmailFillableFields;
    }


    public static create(data: Partial<IEmails>): IEmails {
        const fillables = this.getFillable();
        return this.fill(data, fillables);
    }

}


export default EmailsModel;