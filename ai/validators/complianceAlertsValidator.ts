import { ValidationIssue, ValidationResult } from './invoicesValidator';


//* -------------------------------------------------------------------------- */
//*                   COMPLIANCE ALERTS STRUCTURAL VALIDATOR                   */
//* -------------------------------------------------------------------------- */
//* Layer 1 — synchronous, zero LLM cost.
//* Validates the raw extracted JSON object against deterministic rules before
//* any LLM QA agent runs. A critical failure short-circuits the QA loop entirely.

abstract class ComplianceAlertsValidator {

    //* -------------------------------------------------------------------------- */
    //*                              VALIDATE METHOD                               */
    //* -------------------------------------------------------------------------- */
    public static validate(data: any): ValidationResult {
        const issues: ValidationIssue[] = [];

        //* Critical: vendor / insured name must be present
        if (!data?.vendor || String(data.vendor).trim() === '') {
            issues.push({
                field: 'vendor',
                rule: 'required_critical',
                severity: 'critical',
                message: 'Vendor / insured name is missing — cannot attribute this COI',
            });
        }

        //* Critical: expirationDate must be present
        if (!data?.expirationDate || String(data.expirationDate).trim() === '') {
            issues.push({
                field: 'expirationDate',
                rule: 'required_critical',
                severity: 'critical',
                message: 'COI expiration date is missing — expiration tracking is not possible',
            });
        } else if (isNaN(Date.parse(data.expirationDate))) {
            //* Critical: expirationDate must be parseable
            issues.push({
                field: 'expirationDate',
                rule: 'valid_date',
                severity: 'critical',
                message: `Expiration date '${data.expirationDate}' is not a parseable date`,
            });
        }

        //* Warning: effectiveDate must be parseable if present
        if (data?.effectiveDate) {
            if (isNaN(Date.parse(data.effectiveDate))) {
                issues.push({
                    field: 'effectiveDate',
                    rule: 'valid_date',
                    severity: 'warning',
                    message: `Effective date '${data.effectiveDate}' is not a parseable date`,
                });
            }
        }

        //* Warning: expiration must not precede effective date
        if (data?.effectiveDate && data?.expirationDate) {
            const effective = Date.parse(data.effectiveDate);
            const expiration = Date.parse(data.expirationDate);
            if (!isNaN(effective) && !isNaN(expiration) && expiration < effective) {
                issues.push({
                    field: 'expirationDate',
                    rule: 'expiration_after_effective',
                    severity: 'warning',
                    message: `Expiration date (${data.expirationDate}) precedes effective date (${data.effectiveDate})`,
                });
            }
        }

        //* Warning: document must not already be expired at time of processing
        if (data?.expirationDate && !isNaN(Date.parse(data.expirationDate))) {
            if (new Date(data.expirationDate) < new Date()) {
                issues.push({
                    field: 'expirationDate',
                    rule: 'not_expired',
                    severity: 'warning',
                    message: `COI has already expired as of ${data.expirationDate}`,
                });
            }
        }

        //* Warning: policyNumber should be present and non-empty array
        const hasPolicyNumbers = Array.isArray(data?.policyNumber) && data.policyNumber.length > 0;
        if (!hasPolicyNumbers) {
            issues.push({
                field: 'policyNumber',
                rule: 'recommended_field',
                severity: 'warning',
                message: 'Policy number(s) are missing — compliance tracking is degraded without them',
            });
        }

        //* Warning: confidence must be in [0, 1] range
        if (data?.confidence !== undefined) {
            const conf = parseFloat(data.confidence);
            if (isNaN(conf) || conf < 0 || conf > 1) {
                issues.push({
                    field: 'confidence',
                    rule: 'confidence_range',
                    severity: 'warning',
                    message: `Confidence score out of range [0, 1] — received: ${data.confidence}`,
                });
            }
        }

        const criticalCount = issues.filter(i => i.severity === 'critical').length;
        const warningCount = issues.filter(i => i.severity === 'warning').length;

        return {
            passed: criticalCount === 0,
            issues,
            criticalCount,
            warningCount,
        };
    }

}

export default ComplianceAlertsValidator;
