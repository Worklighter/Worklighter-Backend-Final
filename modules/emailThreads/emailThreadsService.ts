import { Utils } from "../../utils/utils";
import { IEmailThreads } from "./emailThreadsInterface";

class EmailThreadsService {

    /*
    * ╔══════════════════════════════════════╗
    * ║          PROTECTED METHODS           ║
    * ╚══════════════════════════════════════╝
    */


    protected attachMetaData(data: Partial<IEmailThreads>) {
        data.createdAt = Utils.getCurrentDate();
    }


    /*
   * ╔═══════════════════════════════════╗
   * ║          PUBLIC METHODS           ║
   * ╚═══════════════════════════════════╝
    */




}


export default new EmailThreadsService();