import { Utils } from "../../utils/utils";
import FillableField from "../interfaces/fillableFields";

abstract class BaseModel<T> {
    protected static fill<T>(data: Partial<T>, fillables: FillableField[]): T {
        for (const field of fillables) {
            const { column } = field;
            if (!data[column as keyof T] && data[column as keyof T] !== false) {
                data[column as keyof T] = <T[keyof T]>Utils.getValueOfUnAssignedData(field);
            }
        }
        return <T>data;
    }
}

export default BaseModel;
