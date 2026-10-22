

export interface ValidationIssue {
    field: string;
    rule: string;
    severity: 'critical' | 'warning';
    message: string;
}

export interface ValidationResult {
    passed: boolean;
    issues: ValidationIssue[];
    criticalCount: number;
    warningCount: number;
}


//* -------------------------------------------------------------------------- */
//*                        INVOICES STRUCTURAL VALIDATOR                       */
//* -------------------------------------------------------------------------- */
//* Layer 1 — synchronous, zero LLM cost.
//* Validates the raw extracted JSON object against deterministic rules before
//* any LLM QA agent runs. A critical failure short-circuits the QA loop entirely.

abstract class InvoicesValidator {

    //* -------------------------------------------------------------------------- */
    //*                              VALIDATE METHOD                               */
    //* -------------------------------------------------------------------------- */
    public static validate(data: any): ValidationResult {
        const issues: ValidationIssue[] = [];

        //* Critical: invoiceNumber must be present
        if (!data?.invoiceNumber || String(data.invoiceNumber).trim() === '') {
            issues.push({
                field: 'invoiceNumber',
                rule: 'required_critical',
                severity: 'critical',
                message: 'Invoice number is missing — cannot process without a unique identifier',
            });
        }

        //* Critical: vendor must be present
        if (!data?.vendor || String(data.vendor).trim() === '') {
            issues.push({
                field: 'vendor',
                rule: 'required_critical',
                severity: 'critical',
                message: 'Vendor name is missing — cannot attribute this invoice',
            });
        }

        //* Critical: amount must be present and positive
        if (data?.amount === null || data?.amount === undefined) {
            issues.push({
                field: 'amount',
                rule: 'required_critical',
                severity: 'critical',
                message: 'Invoice total amount is missing',
            });
        } else if (typeof data.amount !== 'number' || data.amount <= 0) {
            issues.push({
                field: 'amount',
                rule: 'positive_number',
                severity: 'critical',
                message: `Invoice amount must be a positive number — received: ${data.amount}`,
            });
        }

        //* Warning: invoiceDate format must be parseable if present
        if (data?.invoiceDate) {
            if (isNaN(Date.parse(data.invoiceDate))) {
                issues.push({
                    field: 'invoiceDate',
                    rule: 'valid_date',
                    severity: 'warning',
                    message: `Invoice date '${data.invoiceDate}' is not a parseable date`,
                });
            }
        }

        //* Warning: invoiceDueDate format must be parseable if present
        if (data?.invoiceDueDate) {
            if (isNaN(Date.parse(data.invoiceDueDate))) {
                issues.push({
                    field: 'invoiceDueDate',
                    rule: 'valid_date',
                    severity: 'warning',
                    message: `Invoice due date '${data.invoiceDueDate}' is not a parseable date`,
                });
            }
        }

        //* Warning: due date must not precede invoice date
        if (data?.invoiceDate && data?.invoiceDueDate) {
            const issue = Date.parse(data.invoiceDate);
            const due = Date.parse(data.invoiceDueDate);
            if (!isNaN(issue) && !isNaN(due) && due < issue) {
                issues.push({
                    field: 'invoiceDueDate',
                    rule: 'due_after_issue',
                    severity: 'warning',
                    message: `Due date (${data.invoiceDueDate}) precedes issue date (${data.invoiceDate})`,
                });
            }
        }

        //* Warning: lineItems should be an array if present
        if (data?.lineItems !== undefined && !Array.isArray(data.lineItems)) {
            issues.push({
                field: 'lineItems',
                rule: 'array_type',
                severity: 'warning',
                message: 'lineItems must be an array',
            });
        }

        //* Warning: confidence must be in [0, 1] range
        if (data?.confidence !== undefined) {
            if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
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

export default InvoicesValidator;
