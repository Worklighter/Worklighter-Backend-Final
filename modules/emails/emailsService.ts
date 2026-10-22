import { Utils } from "../../utils/utils";
import IJWTPayload from "../../core/interfaces/jwt";
import { IEmails } from "./emailsInterface";

class EmailsService {

    protected attachMetaData(data: Partial<IEmails>, loggedInUser: IJWTPayload) {
        data.createdAt = Utils.getCurrentDate();
        data.createdBy = loggedInUser.id;
    }



}


export default new EmailsService();