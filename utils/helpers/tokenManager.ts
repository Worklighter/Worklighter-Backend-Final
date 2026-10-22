import { createHash } from 'crypto';
import QueryOperators from '../../core/enums/queryOperators';
import { IIssuedToken } from '../../modules/issuedTokens/issuedTokensInterface';
import IssuedTokenModel from '../../modules/issuedTokens/issuedTokensModel';
import IssuedTokensRepository from '../../modules/issuedTokens/issuedTokensRepository';
import { Utils } from '../utils';

class TokenManager {

    private hashToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    public async issueToken(token: string, userId: string, tenantId: string, expiresAt: Date): Promise<void> {
        const tokenHash = this.hashToken(token);

        const record: Partial<IIssuedToken> = {
            userId,
            tenantId,
            tokenHash,
            isActive: true,
            expiresAt: expiresAt.toISOString(),
            createdAt: Utils.getCurrentDate(),
        };

        const model = IssuedTokenModel.create(record);
        await IssuedTokensRepository.getInstance().Add(model);
    }

    public async isTokenActive(token: string): Promise<boolean> {
        const tokenHash = this.hashToken(token);

        const record: IIssuedToken | null = await IssuedTokensRepository.getInstance().GetOneByParams([
            { param: 'tokenHash', value: tokenHash, operator: QueryOperators.AND },
            { param: 'isActive', value: true, operator: QueryOperators.AND },
        ]);

        if (!record) return false;

        if (new Date() > new Date(record.expiresAt)) return false;

        return true;
    }

    public async revokeToken(token: string): Promise<void> {
        const tokenHash = this.hashToken(token);

        const record: IIssuedToken | null = await IssuedTokensRepository.getInstance().GetOneByParams([
            { param: 'tokenHash', value: tokenHash, operator: QueryOperators.AND },
        ]);

        if (record?._id) {
            await IssuedTokensRepository.getInstance().UpdateMany(
                [{ param: 'tokenHash', value: tokenHash, operator: QueryOperators.AND }],
                { isActive: false }
            );
        }
    }

    public async revokeAllUserTokens(userId: string): Promise<void> {
        await IssuedTokensRepository.getInstance().UpdateMany(
            [{ param: 'userId', value: userId, operator: QueryOperators.AND }],
            { isActive: false }
        );
    }
}

export default new TokenManager();
