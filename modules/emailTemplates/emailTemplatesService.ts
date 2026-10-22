import { Application } from "../../app";
import EmailTemplateTypes from "../../core/enums/emailTemplateTypes";
import { Utils } from "../../utils/utils";

interface ITeamInvitationRecipient {
	email: string;
	firstName: string;
	role: string;
	password: string;
}

class EmailTemplatesService {
	public async sendTeamInvitations(teamMembers: ITeamInvitationRecipient[], companyName: string): Promise<void> {
		for (const member of teamMembers) {
			try {
				await Utils.sendMail(
					member.email,
					EmailTemplateTypes.TEAM_INVITATION,
					{
						firstName: member.firstName,
						companyName,
						role: member.role,
						email: member.email,
						password: member.password,
						clientUrl: Application.conf.CLIENT_URL
					}
				);
			} catch (error) {
				console.error(`Failed to send team invitation email to ${member.email}:`, error);
			}
		}
	}
}

export default new EmailTemplatesService();
