import { IWCCode, WCCodeType } from './wcCodesInterface';
import { Utils } from '../../utils/utils';

/**
 * ╔═══════════════════════════════════════╗
 * ║       WC CODES SEEDER                 ║
 * ║   Industry Standard Workers Comp Codes║
 * ╚═══════════════════════════════════════╝
 */

/**
 * 10 Industry-standard Workers Compensation codes for construction
 */
export const standardWCCodes: Partial<IWCCode>[] = [
    {
        codeNumber: '6421',
        category: 'Concrete',
        description: 'Carpentry - NOC',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',        // 👈 ADD: System user

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    },
    {
        codeNumber: '5606',
        category: 'Painting',
        description: 'Painting - NOC',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    },
    {
        codeNumber: '5403',
        category: 'Carpentry',
        description: 'Carpentry Work',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    },
    {
        codeNumber: '5506',
        category: 'Plumbing',
        description: 'Plumbing Installation',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    },
    {
        codeNumber: '5537',
        category: 'HVAC',
        description: 'HVAC Installation',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    },
    {
        codeNumber: '5645',
        category: 'Electrical',
        description: 'Electrical Wiring',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    },
    {
        codeNumber: '8810',
        category: 'Office',
        description: 'Clerical Office Employees',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    },
    {
        codeNumber: '9015',
        category: 'Building',
        description: 'Building Operation',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    },
    {
        codeNumber: '5213',
        category: 'Concrete',
        description: 'Concrete Construction',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    },
    {
        codeNumber: '5022',
        category: 'Masonry',
        description: 'Masonry Work',
        type: WCCodeType.STANDARD,
        tenantId: 'system',
        userId: 'system',

        isActive: true,
        createdAt: new Date(Utils.getCurrentDate()),
        createdBy: 'System',
        updatedAt: null,
        updatedBy: null,
        deletedAt: null
    }
];
