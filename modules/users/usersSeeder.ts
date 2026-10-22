import StatusTypes from "../../core/enums/statusTypes";
import UserRoles from "../../core/enums/userRoles";
import { Utils } from "../../utils/utils";
import SecurityManager from "../../utils/helpers/securityManager";
import { IUsers } from "./usersInterface";

const DEFAULT_PLATFORM_ADMIN_EMAIL = (
  process.env.PLATFORM_ADMIN_SEED_EMAIL ||
  process.env.SUPERADMIN_SEED_EMAIL ||
  "admin@worklighter.com"
).trim().toLowerCase();

const DEFAULT_PLATFORM_ADMIN_PASSWORD =
  process.env.PLATFORM_ADMIN_SEED_PASSWORD ||
  process.env.SUPERADMIN_SEED_PASSWORD ||
  "AlPha123@!";

const DEFAULT_PLATFORM_ADMIN_FIRST_NAME =
  process.env.PLATFORM_ADMIN_SEED_FIRST_NAME ||
  process.env.SUPERADMIN_SEED_FIRST_NAME ||
  "Admin";

const DEFAULT_PLATFORM_ADMIN_LAST_NAME =
  process.env.PLATFORM_ADMIN_SEED_LAST_NAME ||
  process.env.SUPERADMIN_SEED_LAST_NAME ||
  "Worklighter";

const DEFAULT_PLATFORM_ADMIN_USERNAME =
  process.env.PLATFORM_ADMIN_SEED_USERNAME ||
  process.env.SUPERADMIN_SEED_USERNAME ||
  "admin.worklighter";

export async function buildDefaultPlatformAdminSeed(): Promise<Partial<IUsers>> {
  const password = await SecurityManager.hashPassword(
    DEFAULT_PLATFORM_ADMIN_PASSWORD,
  );
  const now = Utils.getCurrentDate();

  return {
    email: DEFAULT_PLATFORM_ADMIN_EMAIL,
    firstName: DEFAULT_PLATFORM_ADMIN_FIRST_NAME,
    lastName: DEFAULT_PLATFORM_ADMIN_LAST_NAME,
    username: DEFAULT_PLATFORM_ADMIN_USERNAME,
    tenantId: "system",
    role: UserRoles.PLATFORMADMIN,
    password,
    accountStatus: StatusTypes.ACTIVE,
    isActive: true,
    isEmailVerified: true,
    emailVerifiedAt: now,
    createdAt: now,
    createdBy: "System",
    updatedAt: null,
    updatedBy: null,
    deletedAt: null,
  };
}

export async function buildTenantUsersSeed(): Promise<Partial<IUsers>[]> {
  return [
    {
      email: "bill@worklighter.com",
      firstName: "Bill",
      lastName: "West",
      username: "bill.west",
      role: UserRoles.ADMIN,
      password:
        "$2a$12$x0ZPt7aphSeoRhj4rGB3PO7mfJWQ3CPMehMGglBkmmmkTEsZdNNZS",
      profilePicImage: null,
      accountStatus: StatusTypes.ACTIVE,
      tenantId: Utils.UUIDGenerator(),
      isActive: true,
      isEmailVerified: true,
      emailVerifiedAt: Utils.getCurrentDate(),
      createdAt: Utils.getCurrentDate(),
      createdBy: "System",
      updatedAt: null,
      updatedBy: null,
      deletedAt: null,
    },
  ];
}

export async function buildUsersSeed(): Promise<Partial<IUsers>[]> {
  const defaultPlatformAdmin = await buildDefaultPlatformAdminSeed();
  const tenantUsers = await buildTenantUsersSeed();

  return [
    defaultPlatformAdmin,
    ...tenantUsers,
  ];
}
