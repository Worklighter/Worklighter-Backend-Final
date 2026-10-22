import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { ICompany, CompanyFillableFields } from "./companyInterface";

export abstract class CompanyModel extends BaseModel<ICompany> {

	protected static getFillable(): FillableField[] {
		return CompanyFillableFields;
	}

	public static create(data: Partial<ICompany>): ICompany {
		const fillables = this.getFillable();
		const model: Partial<ICompany> = {};
		fillables.forEach((field: FillableField) => {
			if (data.hasOwnProperty(field.column)) {
				model[field.column] = data[field.column];
			}
		});
		return model as ICompany;
	}
}

export default CompanyModel;
