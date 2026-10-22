import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { IssuedTokenFillableFields, IIssuedToken } from "./issuedTokensInterface";

abstract class IssuedTokenModel extends BaseModel<IIssuedToken> {
    protected static getFillable(): FillableField[] {
        return IssuedTokenFillableFields;
    }

    public static create(data: Partial<IIssuedToken>): IIssuedToken {
        return this.fill(data, this.getFillable()) as IIssuedToken;
    }
}

export default IssuedTokenModel;
