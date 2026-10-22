import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { OtpFillableFields, IOtp } from "./otpInterface";

abstract class OtpModel extends BaseModel<IOtp> {
    protected static getFillable(): FillableField[] {
        return OtpFillableFields;
    }

    public static create(data: Partial<IOtp>): IOtp {
        const fillables = this.getFillable();
        return this.fill(data, fillables) as IOtp;
    }
}

export default OtpModel;
