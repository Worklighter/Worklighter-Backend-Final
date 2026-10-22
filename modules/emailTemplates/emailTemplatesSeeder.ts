import EmailTemplateFormat from "../../core/enums/emailTemplateFormat";
import EmailTemplateTypes from "../../core/enums/emailTemplateTypes";
import { URLS } from "../../utils/constants";
import { IEmailTemplates } from "./emailTemplatesInterface";

// Called at seeder runtime (after Application.conf is ready), not at module load time
export function buildEmailTemplatesSeed(appUrl: string, supportEmail: string): Partial<IEmailTemplates>[] {

    const LOGO = URLS.WORKLIGHTER_LOGO;
    const YEAR = new Date().getFullYear();
    const APP_URL = appUrl;
    const SUPPORT_EMAIL = supportEmail;

    // ─── Design tokens ────────────────────────────────────────────────────────
    const OUTER_BG   = '#F0F4F8';          // page background
    const HEADER_BG  = '#ffffff';          // white logo header
    const ACCENT     = '#1F6F66';          // Worklighter green — accent bar & headings
    const CARD_BG    = '#ffffff';
    const CARD_BORDER = '#E2E8F0';
    const BODY_TEXT  = '#374151';
    const MUTED_TEXT = '#6B7280';
    const OTP_BG     = '#F0FBF9';
    const OTP_BORDER = '#A7F3D0';
    const OTP_COLOR  = '#065F46';
    const CRED_BG    = '#F8FAFC';
    const CRED_BORDER = '#E2E8F0';
    const BTN_BG     = '#1F6F66';
    const WARN_BG    = '#FFFBEB';
    const WARN_BORDER = '#FCD34D';
    const WARN_COLOR  = '#92400E';

    // Shared header (white bar with logo + thin green accent line)
    const HEADER = `
    <mj-section background-color="${HEADER_BG}" padding="28px 40px 20px">
      <mj-column>
        <mj-image src="${LOGO}" width="150px" alt="Worklighter" align="center" padding="0" />
      </mj-column>
    </mj-section>
    <mj-section background-color="${ACCENT}" padding="0">
      <mj-column padding="0">
        <mj-text padding="0" font-size="1px" line-height="3px" color="${ACCENT}"> </mj-text>
      </mj-column>
    </mj-section>`;

    // Shared footer
    const FOOTER = `
    <mj-section background-color="${OUTER_BG}" padding="24px 40px 32px">
      <mj-column>
        <mj-text align="center" font-size="11px" color="${MUTED_TEXT}" line-height="18px" padding="0">
          Questions? Reply to this email or contact us at
          <a href="mailto:${SUPPORT_EMAIL}" style="color:${ACCENT};text-decoration:none;">${SUPPORT_EMAIL}</a>
        </mj-text>
        <mj-text align="center" font-size="11px" color="#9CA3AF" line-height="18px" padding="6px 0 0">
          © ${YEAR} Worklighter. All rights reserved.
        </mj-text>
      </mj-column>
    </mj-section>`;

    return [

        /* ─── Account Created ───────────────────────────────────────────────────── */
        {
            templateName: 'New Account Creation',
            templateType: EmailTemplateTypes.ACCOUNT_CREATED,
            slug: EmailTemplateTypes.ACCOUNT_CREATED,
            subject: 'Welcome to Worklighter — your account is ready',
            templateFormat: EmailTemplateFormat.MJML,
            mjml: `<mjml>
  <mj-head>
    <mj-title>Welcome to Worklighter!</mj-title>
    <mj-preview>Your Worklighter account is ready. Here are your login credentials.</mj-preview>
    <mj-attributes>
      <mj-all font-family="'Inter', Arial, sans-serif" />
      <mj-text color="${BODY_TEXT}" font-size="15px" line-height="26px" />
    </mj-attributes>
    <mj-style>
      a { color: ${ACCENT}; }
    </mj-style>
  </mj-head>
  <mj-body background-color="${OUTER_BG}">
    ${HEADER}

    <mj-section background-color="${OUTER_BG}" padding="32px 24px 0">
      <mj-column background-color="${CARD_BG}" border="1px solid ${CARD_BORDER}" border-radius="16px" padding="40px 32px">
        <mj-text font-size="22px" font-weight="700" color="#111827" line-height="30px" padding="0 0 8px">
          Welcome aboard, {{username}}! 👋
        </mj-text>
        <mj-text padding="0 0 24px" color="${MUTED_TEXT}" font-size="15px">
          Your Worklighter account has been created. Use the credentials below to sign in and start managing your construction documents.
        </mj-text>
        <mj-divider border-color="${CARD_BORDER}" border-width="1px" padding="0 0 24px" />

        <!-- Credentials block -->
        <mj-text font-size="11px" font-weight="700" color="${MUTED_TEXT}" letter-spacing="1px" padding="0 0 10px">
          YOUR LOGIN CREDENTIALS
        </mj-text>
        <mj-text padding="0" container-background-color="${CRED_BG}" border-radius="10px">
          <div style="background-color:${CRED_BG};border:1px solid ${CRED_BORDER};border-radius:10px;padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:12px;color:${MUTED_TEXT};font-weight:600;">Email</p>
            <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#111827;">{{email}}</p>
            <p style="margin:0 0 4px;font-size:12px;color:${MUTED_TEXT};font-weight:600;">Temporary Password</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">{{password}}</p>
          </div>
        </mj-text>

        <mj-button href="${APP_URL}/login" background-color="${BTN_BG}" color="#ffffff" border-radius="10px" font-size="14px" font-weight="600" inner-padding="14px 32px" padding="28px 0 8px" width="100%">
          Sign In to Worklighter →
        </mj-button>

        <mj-text padding="16px 0 0" font-size="13px" color="${MUTED_TEXT}" align="center">
          🔒 Please change your password immediately after your first login.
        </mj-text>
      </mj-column>
    </mj-section>

    ${FOOTER}
  </mj-body>
</mjml>`,
            html: '',
            text: 'Hi {{username}}, welcome to Worklighter! Your email is {{email}} and your temporary password is {{password}}. Visit ${APP_URL}/login to get started. Please change your password after your first login.',
            createdAt: new Date().toISOString(),
            createdBy: 'System',
            updatedAt: null,
            updatedBy: null,
            deletedAt: null,
        },

        /* ─── Forgot Password ───────────────────────────────────────────────────── */
        {
            templateName: 'Forgot Password',
            templateType: EmailTemplateTypes.FORGOT_PASSWORD,
            slug: EmailTemplateTypes.FORGOT_PASSWORD,
            subject: 'Your Worklighter password reset code',
            templateFormat: EmailTemplateFormat.MJML,
            mjml: `<mjml>
  <mj-head>
    <mj-title>Password Reset</mj-title>
    <mj-preview>Use this code to reset your Worklighter password. Expires in 15 minutes.</mj-preview>
    <mj-attributes>
      <mj-all font-family="'Inter', Arial, sans-serif" />
      <mj-text color="${BODY_TEXT}" font-size="15px" line-height="26px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="${OUTER_BG}">
    ${HEADER}

    <mj-section background-color="${OUTER_BG}" padding="32px 24px 0">
      <mj-column background-color="${CARD_BG}" border="1px solid ${CARD_BORDER}" border-radius="16px" padding="40px 32px">
        <mj-text font-size="22px" font-weight="700" color="#111827" line-height="30px" padding="0 0 8px">
          Password Reset Request
        </mj-text>
        <mj-text padding="0 0 24px" color="${MUTED_TEXT}">
          Hi {{firstName}}, we received a request to reset the password on your Worklighter account. Enter the code below to continue.
        </mj-text>
        <mj-divider border-color="${CARD_BORDER}" border-width="1px" padding="0 0 28px" />

        <!-- OTP block -->
        <mj-text font-size="11px" font-weight="700" color="${MUTED_TEXT}" letter-spacing="1px" padding="0 0 12px" align="center">
          YOUR VERIFICATION CODE
        </mj-text>
        <mj-text align="center" padding="20px 0" font-size="42px" font-weight="700" letter-spacing="10px" color="${OTP_COLOR}" line-height="52px" container-background-color="${OTP_BG}">
          <span style="display:block;border-radius:12px;">{{otp}}</span>
        </mj-text>

        <mj-text padding="16px 0 8px" font-size="13px" color="${MUTED_TEXT}" align="center">
          ⏱ This code expires in <strong style="color:#111827;">15 minutes</strong>.
        </mj-text>
        <mj-text padding="0" font-size="13px" color="${MUTED_TEXT}" align="center">
          Never share this code with anyone — Worklighter will never ask for it.
        </mj-text>

        <mj-divider border-color="${CARD_BORDER}" border-width="1px" padding="24px 0 20px" />
        <mj-text padding="0" font-size="13px" color="${MUTED_TEXT}">
          If you didn't request a password reset, you can safely ignore this email. Your account is secure.
        </mj-text>
      </mj-column>
    </mj-section>

    ${FOOTER}
  </mj-body>
</mjml>`,
            html: '',
            text: 'Hi {{firstName}}, your Worklighter password reset code is {{otp}}. This code expires in 15 minutes. Do not share it with anyone.',
            createdAt: new Date().toISOString(),
            createdBy: 'System',
            updatedAt: null,
            updatedBy: null,
            deletedAt: null,
        },

        /* ─── Email Verification ────────────────────────────────────────────────── */
        {
            templateName: 'Email Verification',
            templateType: EmailTemplateTypes.EMAIL_VERIFICATION,
            slug: EmailTemplateTypes.EMAIL_VERIFICATION,
            subject: 'Verify your Worklighter email address',
            templateFormat: EmailTemplateFormat.MJML,
            mjml: `<mjml>
  <mj-head>
    <mj-title>Verify Your Email</mj-title>
    <mj-preview>Enter this code to verify your Worklighter email address. Expires in 15 minutes.</mj-preview>
    <mj-attributes>
      <mj-all font-family="'Inter', Arial, sans-serif" />
      <mj-text color="${BODY_TEXT}" font-size="15px" line-height="26px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="${OUTER_BG}">
    ${HEADER}

    <mj-section background-color="${OUTER_BG}" padding="32px 24px 0">
      <mj-column background-color="${CARD_BG}" border="1px solid ${CARD_BORDER}" border-radius="16px" padding="40px 32px">
        <mj-text font-size="22px" font-weight="700" color="#111827" line-height="30px" padding="0 0 8px">
          Verify your email address
        </mj-text>
        <mj-text padding="0 0 24px" color="${MUTED_TEXT}">
          Hi {{firstName}}, please verify your email address to continue using Worklighter. Enter the code below to confirm your identity.
        </mj-text>
        <mj-divider border-color="${CARD_BORDER}" border-width="1px" padding="0 0 28px" />

        <!-- OTP block -->
        <mj-text font-size="11px" font-weight="700" color="${MUTED_TEXT}" letter-spacing="1px" padding="0 0 12px" align="center">
          YOUR VERIFICATION CODE
        </mj-text>
        <mj-text align="center" padding="20px 0" font-size="42px" font-weight="700" letter-spacing="10px" color="${OTP_COLOR}" line-height="52px" container-background-color="${OTP_BG}">
          <span style="display:block;border-radius:12px;">{{otp}}</span>
        </mj-text>

        <mj-text padding="16px 0 0" font-size="13px" color="${MUTED_TEXT}" align="center">
          ⏱ This code expires in <strong style="color:#111827;">15 minutes</strong>.
        </mj-text>
        <mj-divider border-color="${CARD_BORDER}" border-width="1px" padding="24px 0 20px" />
        <mj-text padding="0" font-size="13px" color="${MUTED_TEXT}">
          If you didn't create a Worklighter account, you can safely ignore this email.
        </mj-text>
      </mj-column>
    </mj-section>

    ${FOOTER}
  </mj-body>
</mjml>`,
            html: '',
            text: 'Hi {{firstName}}, your Worklighter email verification code is {{otp}}. This code expires in 15 minutes.',
            createdAt: new Date().toISOString(),
            createdBy: 'System',
            updatedAt: null,
            updatedBy: null,
            deletedAt: null,
        },

        /* ─── Team Invitation ───────────────────────────────────────────────────── */
        {
            templateName: 'Team Invitation',
            templateType: EmailTemplateTypes.TEAM_INVITATION,
            slug: EmailTemplateTypes.TEAM_INVITATION,
            subject: "You've been invited to join {{companyName}} on Worklighter",
            templateFormat: EmailTemplateFormat.MJML,
            mjml: `<mjml>
  <mj-head>
    <mj-title>You've Been Invited</mj-title>
    <mj-preview>You've been invited to join {{companyName}} on Worklighter.</mj-preview>
    <mj-attributes>
      <mj-all font-family="'Inter', Arial, sans-serif" />
      <mj-text color="${BODY_TEXT}" font-size="15px" line-height="26px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="${OUTER_BG}">
    ${HEADER}

    <mj-section background-color="${OUTER_BG}" padding="32px 24px 0">
      <mj-column background-color="${CARD_BG}" border="1px solid ${CARD_BORDER}" border-radius="16px" padding="40px 32px">
        <mj-text font-size="22px" font-weight="700" color="#111827" line-height="30px" padding="0 0 8px">
          You're invited! 🎉
        </mj-text>
        <mj-text padding="0 0 8px" color="${MUTED_TEXT}">
          Hi {{firstName}}, you've been invited to join <strong style="color:#111827;">{{companyName}}</strong> on Worklighter as a
        </mj-text>
        <mj-text padding="0 0 24px">
          <span style="display:inline-block;background-color:${OTP_BG};border:1px solid ${OTP_BORDER};color:${OTP_COLOR};font-weight:700;font-size:13px;padding:4px 14px;border-radius:20px;">{{role}}</span>
        </mj-text>
        <mj-divider border-color="${CARD_BORDER}" border-width="1px" padding="0 0 24px" />

        <!-- Credentials block -->
        <mj-text font-size="11px" font-weight="700" color="${MUTED_TEXT}" letter-spacing="1px" padding="0 0 10px">
          YOUR LOGIN CREDENTIALS
        </mj-text>
        <mj-text padding="0" container-background-color="${CRED_BG}" border-radius="10px">
          <div style="background-color:${CRED_BG};border:1px solid ${CRED_BORDER};border-radius:10px;padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:12px;color:${MUTED_TEXT};font-weight:600;">Email</p>
            <p style="margin:0 0 14px;font-size:14px;font-weight:600;color:#111827;">{{email}}</p>
            <p style="margin:0 0 4px;font-size:12px;color:${MUTED_TEXT};font-weight:600;">Temporary Password</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">{{password}}</p>
          </div>
        </mj-text>

        <mj-button href="${APP_URL}/login" background-color="${BTN_BG}" color="#ffffff" border-radius="10px" font-size="14px" font-weight="600" inner-padding="14px 32px" padding="28px 0 8px" width="100%">
          Accept Invitation →
        </mj-button>

        <mj-text padding="16px 0 0" font-size="13px" color="${MUTED_TEXT}" align="center">
          🔒 Please change your password immediately after your first login.
        </mj-text>
      </mj-column>
    </mj-section>

    ${FOOTER}
  </mj-body>
</mjml>`,
            html: '',
            text: 'Hi {{firstName}}, you have been invited to join {{companyName}} on Worklighter as a {{role}}. Your email is {{email}} and your temporary password is {{password}}. Visit ${APP_URL}/login to accept your invitation.',
            createdAt: new Date().toISOString(),
            createdBy: 'System',
            updatedAt: null,
            updatedBy: null,
            deletedAt: null,
        },

        /* ─── COI Expiring Soon Internal ────────────────────────────────────────── */
        {
            templateName: 'COI Expiring Soon Internal Alert',
            templateType: EmailTemplateTypes.COI_EXPIRING_SOON_INTERNAL,
            slug: EmailTemplateTypes.COI_EXPIRING_SOON_INTERNAL,
            subject: '⚠️ COI expiring soon: {{vendorName}}',
            templateFormat: EmailTemplateFormat.MJML,
            mjml: `<mjml>
  <mj-head>
    <mj-title>COI Expiring Soon</mj-title>
    <mj-preview>Action required: {{vendorName}}'s Certificate of Insurance is expiring soon.</mj-preview>
    <mj-attributes>
      <mj-all font-family="'Inter', Arial, sans-serif" />
      <mj-text color="${BODY_TEXT}" font-size="15px" line-height="26px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="${OUTER_BG}">
    ${HEADER}

    <mj-section background-color="${OUTER_BG}" padding="32px 24px 0">
      <mj-column background-color="${CARD_BG}" border="1px solid ${CARD_BORDER}" border-radius="16px" padding="40px 32px">
        <!-- Warning badge -->
        <mj-text align="center" padding="0 0 20px">
          <span style="display:inline-block;background-color:${WARN_BG};border:1px solid ${WARN_BORDER};color:${WARN_COLOR};font-weight:700;font-size:12px;padding:5px 16px;border-radius:20px;letter-spacing:0.5px;">⚠️ ACTION REQUIRED</span>
        </mj-text>
        <mj-text font-size="22px" font-weight="700" color="#111827" line-height="30px" padding="0 0 8px">
          Certificate of Insurance Expiring Soon
        </mj-text>
        <mj-text padding="0 0 24px" color="${MUTED_TEXT}">
          A vendor's compliance record is within your configured renewal window and requires attention.
        </mj-text>
        <mj-divider border-color="${CARD_BORDER}" border-width="1px" padding="0 0 24px" />

        <!-- Alert details -->
        <mj-text font-size="11px" font-weight="700" color="${MUTED_TEXT}" letter-spacing="1px" padding="0 0 12px">
          ALERT DETAILS
        </mj-text>
        <mj-text padding="0">
          <div style="background-color:${WARN_BG};border:1px solid ${WARN_BORDER};border-radius:10px;padding:20px 24px;">
            <p style="margin:0 0 10px;font-size:14px;"><span style="color:${MUTED_TEXT};font-size:12px;font-weight:600;display:block;margin-bottom:2px;">VENDOR</span><strong style="color:#111827;">{{vendorName}}</strong></p>
            <p style="margin:0 0 10px;font-size:14px;"><span style="color:${MUTED_TEXT};font-size:12px;font-weight:600;display:block;margin-bottom:2px;">EXPIRATION DATE</span><strong style="color:#B45309;">{{expirationDate}}</strong></p>
            <p style="margin:0 0 10px;font-size:14px;"><span style="color:${MUTED_TEXT};font-size:12px;font-weight:600;display:block;margin-bottom:2px;">DAYS REMAINING</span><strong style="color:#B45309;">{{daysUntilExpiration}} days</strong></p>
            <p style="margin:0 0 10px;font-size:14px;"><span style="color:${MUTED_TEXT};font-size:12px;font-weight:600;display:block;margin-bottom:2px;">SUBMISSION ID</span><span style="color:#111827;font-family:monospace;">{{emailSubmissionId}}</span></p>
            <p style="margin:0;font-size:14px;"><span style="color:${MUTED_TEXT};font-size:12px;font-weight:600;display:block;margin-bottom:2px;">INBOUND SUBJECT</span><span style="color:#111827;">{{inboundEmailSubject}}</span></p>
          </div>
        </mj-text>

        <mj-text padding="20px 0 0" font-size="13px" color="${MUTED_TEXT}">
          Please follow up with the vendor according to your compliance process to ensure continuity of coverage.
        </mj-text>
      </mj-column>
    </mj-section>

    ${FOOTER}
  </mj-body>
</mjml>`,
            html: '',
            text: 'COI Alert: Vendor {{vendorName}} expires on {{expirationDate}} ({{daysUntilExpiration}} days remaining). Submission ID: {{emailSubmissionId}}. Subject: {{inboundEmailSubject}}.',
            createdAt: new Date().toISOString(),
            createdBy: 'System',
            updatedAt: null,
            updatedBy: null,
            deletedAt: null,
        },

        /* ─── COI Expiring Soon External ────────────────────────────────────────── */
        {
            templateName: 'COI Expiring Soon External Alert',
            templateType: EmailTemplateTypes.COI_EXPIRING_SOON_EXTERNAL,
            slug: EmailTemplateTypes.COI_EXPIRING_SOON_EXTERNAL,
            subject: 'Action required: Your Certificate of Insurance is expiring soon',
            templateFormat: EmailTemplateFormat.MJML,
            mjml: `<mjml>
  <mj-head>
    <mj-title>COI Renewal Reminder</mj-title>
    <mj-preview>Your Certificate of Insurance is expiring on {{expirationDate}}. Please renew to maintain compliance.</mj-preview>
    <mj-attributes>
      <mj-all font-family="'Inter', Arial, sans-serif" />
      <mj-text color="${BODY_TEXT}" font-size="15px" line-height="26px" />
    </mj-attributes>
  </mj-head>
  <mj-body background-color="${OUTER_BG}">
    ${HEADER}

    <mj-section background-color="${OUTER_BG}" padding="32px 24px 0">
      <mj-column background-color="${CARD_BG}" border="1px solid ${CARD_BORDER}" border-radius="16px" padding="40px 32px">
        <mj-text align="center" padding="0 0 20px">
          <span style="display:inline-block;background-color:${WARN_BG};border:1px solid ${WARN_BORDER};color:${WARN_COLOR};font-weight:700;font-size:12px;padding:5px 16px;border-radius:20px;letter-spacing:0.5px;">⚠️ RENEWAL REQUIRED</span>
        </mj-text>
        <mj-text font-size="22px" font-weight="700" color="#111827" line-height="30px" padding="0 0 8px">
          Your COI is Expiring Soon
        </mj-text>
        <mj-text padding="0 0 24px" color="${MUTED_TEXT}">
          Dear {{vendorName}}, your Certificate of Insurance on file with us is approaching its expiration date. Please renew and provide an updated COI to maintain uninterrupted compliance.
        </mj-text>
        <mj-divider border-color="${CARD_BORDER}" border-width="1px" padding="0 0 24px" />

        <!-- Expiry details -->
        <mj-text padding="0">
          <div style="background-color:${WARN_BG};border:1px solid ${WARN_BORDER};border-radius:10px;padding:20px 24px;">
            <p style="margin:0 0 10px;font-size:14px;"><span style="color:${MUTED_TEXT};font-size:12px;font-weight:600;display:block;margin-bottom:2px;">EXPIRATION DATE</span><strong style="color:#B45309;">{{expirationDate}}</strong></p>
            <p style="margin:0;font-size:14px;"><span style="color:${MUTED_TEXT};font-size:12px;font-weight:600;display:block;margin-bottom:2px;">DAYS REMAINING</span><strong style="color:#B45309;">{{daysUntilExpiration}} days</strong></p>
          </div>
        </mj-text>

        <mj-text padding="20px 0 0" font-size="13px" color="${MUTED_TEXT}">
          Please submit your updated COI before the expiration date. If you have questions or need assistance, reply to this email and we'll be happy to help.
        </mj-text>
      </mj-column>
    </mj-section>

    ${FOOTER}
  </mj-body>
</mjml>`,
            html: '',
            text: 'Dear {{vendorName}}, your Certificate of Insurance expires on {{expirationDate}} ({{daysUntilExpiration}} days remaining). Please provide an updated COI before that date.',
            createdAt: new Date().toISOString(),
            createdBy: 'System',
            updatedAt: null,
            updatedBy: null,
            deletedAt: null,
        },
    ];
}
