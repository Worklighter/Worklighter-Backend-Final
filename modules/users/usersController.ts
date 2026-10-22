import express, { Request, Response } from 'express';
import { Utils } from '../../utils/utils';
import { HttpStatusCode } from 'axios';
import { authMiddleware } from '../../middlewares/authMiddleware';
import requireActiveSubscription from '../../middlewares/requireActiveSubscription';
import { validateRequestBodyViaMiddleware, validateRequestParamsViaMiddleware, validateRequestQueryViaMiddleware } from '../../core/validators/globalValidators';
import UsersService from './usersService';
import { IMAGE_FILE_SIZE_LIMIT, PAGE, PER_PAGE } from '../../utils/constants';
import * as fs from 'fs';
import { IListUsersDTO, IUpdateProfileDTO, IUpdateUserDTO, IInviteTeamMemberDTO, IUpdateTeamMemberDTO, ITeamMemberParamsDTO } from './usersInterface';
import { listUsersValidator, updateUserParamsValidator, updateUserBodyValidator, updateProfileValidator, inviteTeamMemberValidator, updateTeamMemberValidator, teamMemberParamsValidator } from './usersValidator';
import { profilePictureUpload } from '../../middlewares/profilePictureUpload';
import path from 'path';
import UsersRepository from './usersRepository';
import { ObjectId } from 'mongodb';
import { CustomError } from '../../core/errors/custom';
import { Readable } from 'stream';
import AzureBlobStorage from '../../integration/azure/azureBlobStorage';
const routes = express.Router();




//* API TO LIST USERS
routes.get('/', authMiddleware, validateRequestQueryViaMiddleware(listUsersValidator), async (req: Request, res: Response) => {
    const data: IListUsersDTO = {
        searchText: req.validatedQuery?.searchText || null,
        continuationToken: req.validatedQuery?.continuationToken || PAGE,
        pageSize: req.validatedQuery?.pageSize || PER_PAGE,
        fields: req.validatedQuery?.fields || null,
    }
    const result = await UsersService.listUsers(data, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: result.users.length ? 'Users fetched successfully' : 'No users found',
        data: result
    });
});




//* -------------------------------------------------------------------------- */
//*                        API TO UPLOAD PROFILE PICTURE                       */
//* -------------------------------------------------------------------------- */
routes.patch('/profile-picture-upload', authMiddleware, profilePictureUpload, async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const profile = await UsersService.getProfile(req.user);

    let profilePicImage = profile?.profilePicImage; // use 'let' so it can be updated

    if (!req.file) {
        throw new CustomError(400, 'No file uploaded');
    } else {
        const { size, buffer, originalname } = req.file;
        const fileSizeInMB = Utils.convertSizeToMB(size);
        if (fileSizeInMB > IMAGE_FILE_SIZE_LIMIT) {
            throw new CustomError(
                400,
                `File size exceeds ${IMAGE_FILE_SIZE_LIMIT} MB`
            );
        }

        const stream = Readable.from(buffer);
        profilePicImage = await AzureBlobStorage.getInstance().uploadImage(stream, originalname, 'profile-images', req.user?.tenantId);
    }

    // Persist profile picture to user record and then fetch updated profile
    await UsersRepository.getInstance().Update(
        new ObjectId(userId),
        { profilePicImage, updatedAt: new Date() }
    );
    const updatedProfile = await UsersService.getProfile(req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Profile picture uploaded successfully',
        data: updatedProfile
    });
}
);



//* -------------------------------------------------------------------------- */
//*                          DELETE MY PROFILE PICTURE                         */
//* -------------------------------------------------------------------------- */
routes.delete('/profile/me/picture', authMiddleware, async (req: Request, res: Response) => {
    const userId = req.user.id;

    const profile = await UsersService.getProfile(req.user);

    if (profile.profilePicImage) {
        const filePath = path.join(process.cwd(), 'uploads/profile-pictures/', profile.profilePicImage);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    // Update database
    await UsersRepository.getInstance().Update(
        new ObjectId(userId),
        { profilePicImage: null, updatedAt: new Date() }
    );

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Profile picture deleted successfully',
        data: { profilePicImage: null }
    });
});



//* -------------------------------------------------------------------------- */
//*                         API TO UPDATE USER DETAILS                         */
//* -------------------------------------------------------------------------- */
routes.patch('/:userId', authMiddleware, validateRequestParamsViaMiddleware(updateUserParamsValidator), validateRequestBodyViaMiddleware(updateUserBodyValidator), async (req: Request, res: Response) => {
    const data: IUpdateUserDTO = {
        userId: req.validatedParams.userId,
        ...req.validatedBody
    }
    const result = await UsersService.updateUser(data, req.user);
    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'User updated successfully',
        data: result
    });
});




//* -------------------------------------------------------------------------- */
//*                      API TO GET CURRENT USER'S PROFILE                     */
//* -------------------------------------------------------------------------- */
routes.get('/profile/me', authMiddleware, async (req: Request, res: Response) => {
    const result = await UsersService.getProfile(req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Profile retrieved successfully',
        data: result
    });
});



//* -------------------------------------------------------------------------- */
//*    API TO UPDATE CURRENT USER'S PROFILE (First Name and Last Name Only)    */
//* -------------------------------------------------------------------------- */
routes.patch('/profile/me', authMiddleware, validateRequestBodyViaMiddleware(updateProfileValidator), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const updateData: IUpdateProfileDTO = req.validatedBody;

    const updatedProfile = await UsersService.updateProfile(userId, updateData);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Profile updated successfully',
        data: updatedProfile
    });
});





//* -------------------------------------------------------------------------- */
//*                         API TO GET ALL TEAM MEMBERS                        */
//* -------------------------------------------------------------------------- */
routes.get('/team-members', authMiddleware, requireActiveSubscription, async (req: Request, res: Response) => {
    const teamMembers = await UsersService.getTeamMembers(req.user);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: teamMembers.length ? 'Team members retrieved successfully' : 'No team members found',
        data: teamMembers
    });
});



//* -------------------------------------------------------------------------- */
//*                         API TO INVITE A TEAM MEMBER                        */
//* -------------------------------------------------------------------------- */
routes.post('/team-members/invite', authMiddleware, requireActiveSubscription, validateRequestBodyViaMiddleware(inviteTeamMemberValidator), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const data: IInviteTeamMemberDTO = req.validatedBody;

    const newMember = await UsersService.inviteTeamMember(userId, data);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Created,
        status: true,
        responseCode: '201',
        responseDescription: 'Team member invited successfully',
        data: newMember
    });
});


//* -------------------------------------------------------------------------- */
//*                         API TO UPDATE A TEAM MEMBER                        */
//* -------------------------------------------------------------------------- */
routes.patch('/team-members/:memberId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(teamMemberParamsValidator), validateRequestBodyViaMiddleware(updateTeamMemberValidator), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { memberId }: ITeamMemberParamsDTO = req.validatedParams;
    const data: IUpdateTeamMemberDTO = req.validatedBody;

    const updatedMember = await UsersService.updateTeamMember(userId, memberId, data);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Team member updated successfully',
        data: updatedMember
    });
});


//* -------------------------------------------------------------------------- */
//*                         API TO REMOVE A TEAM MEMBER                        */
//* -------------------------------------------------------------------------- */
routes.delete('/team-members/:memberId', authMiddleware, requireActiveSubscription, validateRequestParamsViaMiddleware(teamMemberParamsValidator), async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { memberId }: ITeamMemberParamsDTO = req.validatedParams;

    await UsersService.removeTeamMember(userId, memberId);

    Utils.apiResponse({
        res,
        code: HttpStatusCode.Ok,
        status: true,
        responseCode: '200',
        responseDescription: 'Team member removed successfully',
        data: {}
    });
});



export default routes;
