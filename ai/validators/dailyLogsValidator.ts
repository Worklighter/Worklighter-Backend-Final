import { ValidationIssue, ValidationResult } from './invoicesValidator';


//* -------------------------------------------------------------------------- */
//*                       DAILY LOGS STRUCTURAL VALIDATOR                      */
//* -------------------------------------------------------------------------- */
//* Layer 1 — synchronous, zero LLM cost.
//* Validates the raw extracted JSON object against deterministic rules before
//* any LLM QA agent runs. A critical failure short-circuits the QA loop entirely.

abstract class DailyLogsValidator {

    //* -------------------------------------------------------------------------- */
    //*                              VALIDATE METHOD                               */
    //* -------------------------------------------------------------------------- */
    public static validate(data: any): ValidationResult {
        const issues: ValidationIssue[] = [];

        //* Critical: date must be present
        if (!data?.date || String(data.date).trim() === '') {
            issues.push({
                field: 'date',
                rule: 'required_critical',
                severity: 'critical',
                message: 'Log date is missing — cannot file a daily log without a date',
            });
        } else if (isNaN(Date.parse(data.date))) {
            //* Critical: date must be parseable
            issues.push({
                field: 'date',
                rule: 'valid_date',
                severity: 'critical',
                message: `Log date '${data.date}' is not a parseable date`,
            });
        }

        //* Critical: tasks must be present and non-empty
        if (!data?.tasks || !Array.isArray(data.tasks)) {
            issues.push({
                field: 'tasks',
                rule: 'required_critical',
                severity: 'critical',
                message: 'Tasks array is missing — a daily log must have at least one task',
            });
        } else if (data.tasks.length === 0) {
            issues.push({
                field: 'tasks',
                rule: 'non_empty_array',
                severity: 'critical',
                message: 'Tasks array is empty — a daily log must capture at least one task',
            });
        } else {
            //* Warning: each task must have valid hoursWorked
            data.tasks.forEach((task: any, idx: number) => {
                if (task.hoursWorked !== null && task.hoursWorked !== undefined) {
                    if (typeof task.hoursWorked !== 'number' || task.hoursWorked < 0) {
                        issues.push({
                            field: `tasks[${idx}].hoursWorked`,
                            rule: 'non_negative_hours',
                            severity: 'warning',
                            message: `Task ${idx + 1} has invalid hoursWorked: ${task.hoursWorked}`,
                        });
                    }
                    if (task.hoursWorked > 24) {
                        issues.push({
                            field: `tasks[${idx}].hoursWorked`,
                            rule: 'max_hours_per_task',
                            severity: 'warning',
                            message: `Task ${idx + 1} hoursWorked exceeds 24 hours (${task.hoursWorked}) — likely extraction error`,
                        });
                    }
                }

                if (!task.taskName || String(task.taskName).trim() === '') {
                    issues.push({
                        field: `tasks[${idx}].taskName`,
                        rule: 'required_task_name',
                        severity: 'warning',
                        message: `Task ${idx + 1} is missing a task name`,
                    });
                }
            });
        }

        //* Warning: total hours across all tasks must not exceed 24 × number of workers
        //* (We don't have worker count, so cap at a reasonable upper bound of 200 total hours per log)
        if (Array.isArray(data?.tasks) && data.tasks.length > 0) {
            const totalHours = data.tasks.reduce((sum: number, t: any) => sum + (typeof t.hoursWorked === 'number' ? t.hoursWorked : 0), 0);
            if (totalHours > 200) {
                issues.push({
                    field: 'tasks',
                    rule: 'total_hours_sanity',
                    severity: 'warning',
                    message: `Total hours across all tasks (${totalHours}) is unusually high — review extraction`,
                });
            }
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

export default DailyLogsValidator;
