import FillableField from "../../core/interfaces/fillableFields";
import BaseModel from "../../core/models/baseModel";
import { IKnowledgeBase, KnowledgeBaseFillableFields } from "./knowledgeBaseInterface";

abstract class KnowledgeBaseModel extends BaseModel<IKnowledgeBase> {
    protected static getFillable(): FillableField[] {
        return KnowledgeBaseFillableFields;
    }

    public static create(data: Partial<IKnowledgeBase>): IKnowledgeBase {
        const fillables = this.getFillable();
        return this.fill(data, fillables);
    }
}

export default KnowledgeBaseModel;

