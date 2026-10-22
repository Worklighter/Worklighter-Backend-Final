export const ASC = 1;
export const DESC = -1;
export const DEFAULT_ORDER: string = 'asc';
export const DEFAULT_ROUND_OFF = 2;
export const PER_PAGE = 10;
export const PAGE = 1;
export const OTP_TTL = {
    SECONDS: 30,
    MINUTES: 5
};
export const DEFAULT_CREATED_BY = 'System'
export const IMAGE_FILE_SIZE_LIMIT = 10;
const BYTES_IN_KILOBYTE = 1024;
const BYTES_IN_MEGABYTE = BYTES_IN_KILOBYTE * BYTES_IN_KILOBYTE;
export const RANDOM_OFFSET = 0.5;
export const FILE_SIZE_LIMIT = BYTES_IN_MEGABYTE * 8;
export const DECIMAL_PLACEHOLDER = 0;
export const AGE_LIMIT = 18;
export const JWT_CONFIGURATION = {
    apiAccessTokenExpiration: '3d',
    passwordResetTokenExpiration: '15m'
}
export const DEFAULT_OTP_LENGTH = 4;
export const DEFAULT_GUID_LENGTH = 36;
export const DEFAULT_NUMBER_MIN_LENGTH = 10;
export const DEFAULT_NUMBER_MAX_LENGTH = 15;
export const UUID_SIZE = 36;
export const ADD_HOURS = 5;
export const ALLOWED_HTTP_METHODS = ['POST', 'GET'];
export const DEFAULT_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,20}$/
export const DEFAULT_APPLICATION_PORT = 8000
export const APP_NAME = 'Inquiry Agent'
export const DEFAULT_PAYLOAD_FIELDS_SIZE = {
    MIN_LENGTH: 1,
    MAX_LENGTH: 255,
    NAMES_MAX_SIZE: 50,
    GUEST_USERNAME_SIZE: 12,
    MIN_PASSWORD_LENGTH: 8,
    MAX_PASSWORD_LENGTH: 20,
    MIN_REFUND_POLICY_LENGTH: 10
}

export const TIME_SETTINGS = {
    MIDNIGHT: 12,
    STRIP_LIMIT: 10,
    CONVERT_TO_SEC: 1000,
    CONVERT_TO_MIN: 60000,
    CONVERT_TO_HOUR: 3600000,
    MINUTE_PER_SEC: 60,
    ORDER_TRACKING_WAIT_TIME: 5 * 60 * 1000
}

export const MOBILE_NUMBER_CONFIGURATION = {
    MIN_LENGTH: 10,
    MAX_LENGTH: 15
}

export const PLATFORM_USERNAME_CONFIGURATION = {
    MIN_LENGTH: 3,
    MAX_LENGTH: 30
}

export const DATE_FORMAT_CONFIGURATION = {
    DOB: 'DD-MM-YYYY',
    BOOKINGS: 'YYYY-MM-DD'
}

export const REGEX = {
    GENRE_SUB_GENRE_NAME_REGEX: /^[A-Za-z\s-&]+$/,
    ALPHA_ONLY_REGEX: /^[A-Za-z\s]+$/,
    NON_NUMERIC_STRING_REGEX: /^[^\d]+$/,
    NUMERIC_STRING_REGEX: /^\d*$/,
    POSITIVE_NUMERIC_STRING_REGEX: /^[1-9]\d*$/,
    PHONE_NUMBER_REGEX: new RegExp(`^\\d{${MOBILE_NUMBER_CONFIGURATION.MIN_LENGTH},${MOBILE_NUMBER_CONFIGURATION.MAX_LENGTH}}$`),
    PASSWORD_REGEX: DEFAULT_PASSWORD_REGEX,
    FILE_TYPES: /jpeg|jpg|png|doc|docx|xlsx|pdf|csv|txt/,
    REASON_GUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    STRIP_ESCAPE_QUOTATION_MARKS_REGEX: /['"]/g,
    SOCIAL_LOGIN_CLIENT_ID_REGEX: /^[a-zA-Z0-9-_.]{8,128}$/,
    UUID_V4_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    MONGODB_ID_REGEX: /^[a-f\d]{24}$/i,
    PLATFORM_USERNAME_REGEX: /^(?!.*(\.\.|__))[a-zA-Z0-9._]+$/,
    SLOT_TIME_FORMAT: /^([0-1]\d|2[0-3]):([0-5]\d)$/,
    PAGINATION_CONTINUATION_TOKEN: /^\+RID:[a-zA-Z0-9+/=~]+#RT:\d+(#TRC:\d+)?(#RTD:[a-zA-Z0-9+/=~]+)?#ISV:\d+#IEO:\d+#QCF:\d+$/,
    DATE_IN_YEAR_MONTH_DAY_FORMAT_REGEX: /^\d{4}-\d{2}-\d{2}$/,
    STRIPE_PAYMENT_METHOD_ID_REGEX: /^pm_[a-zA-Z0-9]{24}$/,
    REMOVE_TRAILING_UNDERSCORE_REGEX: /_+$/,
    SHOPIFY_API_KEY_REGEX: /^shpat_[a-f0-9]{32}$/
}


export const DATABASE_DEFAULT_CONFIGURATIONS = {
    DEFAULT_POOL_CONNECTION_SIZE: 10
}

export const DEFAULT_NUMBER_CONFIGURATIONS = {
    INVALID_INDEX: -1,
    ALLOWED_NUMBER_OF_DECIMAL_PLACES: 2
}


export const PAGINATION_CONFIGURATION = {
    DEFAULT_APPLY_PAGINATION: false,
    DEFAULT_PAGE_NUMBER: 1,
    DEFAULT_MAX_PAGE_SIZE: 50,
    DEFAULT_MIN_PAGE_SIZE: 1,
    DEFAULT_CONTINUATION_TOKEN_MIN_VALUE: 1
}

export const RANDOM_PASSWORD_FORMAT = {
    length: 8,
    numbers: true,
    symbols: true,
    lowercase: true,
    uppercase: true,
    excludeSimilarCharacters: true
}



export const SALT_ROUNDS = {
    DEFAULT: 12,
    PASSWORD_SALT_ROUND: 12
}


export const CronJobsQueues = {
    GOOGLE_WATCH_CRON_JOB_QUEUES: {
        REFRESH_GOOGLE_WATCH: 'refreshGoogleWatch'
    }
}


export const BYTE_SIZE = {
    CODE: 8,
    IV: 12,
    KEY: 16,
    SALT: 16,
    SECRET: 32
}


export const ENCRYPTION_CONFIGURATION = {
    SHA_ALGO_KEY_LENGTH: 32,
    SHA_ALGO_ITERATION: 1,
}


export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const DEFAULT_OPTIMIZATION_FIELDS = ['createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'password']


export const MONGODB_COLLECTIONS = {
    USERS: 'users',
    MENUS: 'menus',
    ROLES: 'roles',
    OTPS: 'otps',
    JOBS: 'jobs',
    COST_CODES: 'cost_codes',
    ONBOARDING: 'company',
    EMAILS: 'emails',
    PERMISSIONS: 'permissions',
    EMAIL_SUBMISSIONS: 'email_submissions',
    EMAIL_THREADS: 'email_threads',
    SYSTEM_ALERTS: 'system_alerts',
    EMAIL_TEMPLATES: 'email_templates',
    PLANS: 'plans',
    COI_VENDORS: 'coi_vendors',
    COI_ALERT_CONFIGS: 'coi_alert_configs',
    DOCUMENT_AUDIT_LOGS: 'document_audit_logs',
    KNOWLEDGE_BASE: 'knowledge_base',
    WC_CODES: 'wc_codes',
    SUBSCRIPTIONS: 'subscriptions',
    TRANSACTION_HISTORY: 'transaction_history',
    ISSUED_TOKENS: 'issued_tokens',
}


export const BackgroundJobSettings = {
    MAX_RETRY: 1,  //TODO: Increase this to 3 for better reliability after testing
    REMOVE_ON_FAIL: true,
    DEFAULT_DELAY_IN_PROCESSING: 120000,
    BACKOFF_STRATEGY: {
        backoffType: 'exponential',
        backoffDelay: 1000
    }
}

export const DocumentReflectionSettings = {
    MAX_ITERATIONS: 3
}

//* Thresholds used to classify a compliance alert (COI) document status.
//* EXPIRING_SOON_DAYS: if expirationDate is within this many days from today → expiring_soon
//* Documents past their expirationDate → expired
//* Documents beyond the threshold window → compliant
export const COMPLIANCE_ALERT_THRESHOLDS = {
    EXPIRING_SOON_DAYS: 30,
}


export const BullmqQueues = {
    EMAILS_QUEUES: {
        DOCUMENT_PROCESSING: 'documentProcessing',
        COI_EXPIRING_SOON_ALERTS: 'coiExpiringSoonAlerts'
    },
    KNOWLEDGE_BASE_QUEUES: {
        PROCESS_KNOWLEDGE_BASE_WORKLIGHTER: 'processKnowledgeBaseWorklighter'
    },
}
export const INBOUND_EMAIL_SUBDOMAIN = 'inbound.worklighter.io';

export const URLS = {
    WORKLIGHTER_LOGO: 'https://spotlytmediav1.blob.core.windows.net/worklighter-docs/platform-assets/logo.png',
};
