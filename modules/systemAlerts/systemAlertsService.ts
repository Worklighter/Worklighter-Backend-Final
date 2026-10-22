import SystemAlertsModel from "./systemAlertsModel";
import { Utils } from "../../utils/utils";
import { ISystemAlerts, IStoreSystemAlertDTO } from "./systemAlertsInterface";
import SystemAlertsRepository from "./systemAlertsRepository";


class SystemAlertsService {

    /*
    * ╔══════════════════════════════════════╗
    * ║          PROTECTED METHODS           ║
    * ╚══════════════════════════════════════╝
    */


    protected attachMetaData(data: Partial<ISystemAlerts>) {
        data.isResolved = false;
        data.createdAt = Utils.getCurrentDate();
        data.createdBy = 'System';
    }


    /*
   * ╔═══════════════════════════════════╗
   * ║          PUBLIC METHODS           ║
   * ╚═══════════════════════════════════╝
    */



    public async storeSystemAlert(data: IStoreSystemAlertDTO) {
        this.attachMetaData(data);
        const newSystemAlert = SystemAlertsModel.create(data);
        return SystemAlertsRepository.getInstance().Add(newSystemAlert, ['_id']);
    }




    /*
   * ╔═══════════════════════════════════╗
   * ║          PRIVATE METHODS          ║
   * ╚═══════════════════════════════════╝
    */

}

export default new SystemAlertsService();