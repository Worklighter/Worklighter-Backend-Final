import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { IUsers, UserFillableFields } from "./usersInterface";

abstract class UsersModel extends BaseModel<IUsers> {

    protected static getFillable(): FillableField[] {
        return UserFillableFields;
    }


    public static create(data: Partial<IUsers>): IUsers {
        const fillables = this.getFillable();
        return this.fill(data, fillables);
    }

}


export default UsersModel;