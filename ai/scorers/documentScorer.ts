import { ValidationResult } from '../validators/invoicesValidator';


//* -------------------------------------------------------------------------- */
//*                           ROUTING DECISION ENUM                            */
//* -------------------------------------------------------------------------- */
export enum RoutingDecision {
    AUTO_APPROVE   = 'auto_approve',    // score >= 0.92 — no human review needed
    SOFT_FLAG      = 'soft_flag',       // score 0.75–0.91 — review recommended, data usable
    HUMAN_REVIEW   = 'human_review',    // score 0.50–0.74 — full review required
    REQUEUE        = 'requeue',         // recoverable failure — re-run extraction with critique
    DEAD_LETTER    = 'dead_letter',     // score < 0.50 after max iterations — abandon, alert
}


//* -------------------------------------------------------------------------- */
//*                          SCORE BREAKDOWN INTERFACE                         */
//* -------------------------------------------------------------------------- */
export interface ScoreBreakdown {
    criticalFieldsPresence: number;     // weight: 0.40 — critical fields are non-null
    llmQAAccuracy: number;              // weight: 0.35 — LLM QA confidence (factual accuracy)
    optionalFieldsCompleteness: number; // weight: 0.10 — optional fields populated
    penaltyDeductions: number;          // warning penalty deductions applied
    finalScore: number;                 // weighted sum after deductions, clamped [0, 1]
}


//* -------------------------------------------------------------------------- */
//*                          DOCUMENT SCORER CLASS                             */
//* -------------------------------------------------------------------------- */
//* Computes a weighted confidence score from Layer 1 (structural validation)
//* and Layer 2 (LLM QA) signals, then emits a deterministic routing decision.
//*
//* Score weights:
//*   40% — critical fields present (Layer 1 structural — invoiceNumber, vendor, amount etc.)
//*   35% — LLM QA confidence (factual accuracy of extracted values vs source document)
//*   10% — optional fields completeness (job, notes, dueDate etc.)
//*   15% — reserved for Layer 3 DB checks (not yet implemented — absorbed into base score)
//*   Deductions are applied per warning: -0.05 per warning, capped at -0.20 total
//*
//* Routing thresholds:
//*   >= 0.92 → auto_approve
//*   0.75–0.91 → soft_flag
//*   0.50–0.74 → human_review
//*   qaRecoverable=true → requeue (overrides threshold)
//*   < 0.50 → dead_letter

abstract class DocumentScorer {

    private static readonly WEIGHT_CRITICAL_PRESENCE = 0.40;
    private static readonly WEIGHT_LLM_QA_ACCURACY   = 0.35;
    private static readonly WEIGHT_OPTIONAL_COMPLETENESS = 0.10;
    //* Layer 3 DB weight (0.15) is reserved — not yet active.
    //* Until Layer 3 is implemented, its weight is absorbed into the base score
    //* by not reducing the denominator — the 0.85 sum is normalised below.

    private static readonly WARNING_PENALTY         = 0.05;
    private static readonly MAX_WARNING_PENALTY     = 0.20;

    private static readonly THRESHOLD_AUTO_APPROVE  = 0.92;
    private static readonly THRESHOLD_SOFT_FLAG     = 0.75;
    private static readonly THRESHOLD_HUMAN_REVIEW  = 0.50;


    //* -------------------------------------------------------------------------- */
    //*                              SCORE METHOD                                  */
    //* -------------------------------------------------------------------------- */
    /**
     * @param validationResult  - Output from Layer 1 structural validator
     * @param llmQAConfidence   - Confidence score from the LLM QA agent (0–1)
     * @param optionalFields    - Array of optional field values to measure completeness
     * @param qaRecoverable     - True when QA issued a critique that can be corrected by re-extraction
     * @param maxIterationsHit  - True when the extraction loop exhausted all retries
     */
    public static score(
        validationResult: ValidationResult,
        llmQAConfidence: number,
        optionalFields: (any | null | undefined)[],
        qaRecoverable: boolean,
        maxIterationsHit: boolean,
    ): { breakdown: ScoreBreakdown; routing: RoutingDecision } {

        //* --- 40%: critical fields presence ---
        //* Full marks if Layer 1 passed (no critical issues). Zero if any critical field is missing.
        const criticalScore = validationResult.passed ? 1.0 : 0.0;

        //* --- 35%: LLM QA confidence ---
        //* Clamp incoming score to [0, 1] defensively
        const qaScore = Math.min(1.0, Math.max(0.0, llmQAConfidence));

        //* --- 10%: optional fields completeness ---
        //* Proportion of optional field slots that are non-null/non-empty
        const presentOptionals = optionalFields.filter(f => f !== null && f !== undefined && String(f).trim() !== '').length;
        const optionalScore = optionalFields.length > 0
            ? presentOptionals / optionalFields.length
            : 1.0; // no optional fields defined → full marks

        //* --- Weighted sum (normalised to 0.85 active weight) ---
        const rawScore =
            (criticalScore * this.WEIGHT_CRITICAL_PRESENCE) +
            (qaScore       * this.WEIGHT_LLM_QA_ACCURACY) +
            (optionalScore * this.WEIGHT_OPTIONAL_COMPLETENESS);

        //* Normalise to [0, 1] since only 0.85 weight is active (Layer 3 not yet implemented)
        const normalisedScore = rawScore / (this.WEIGHT_CRITICAL_PRESENCE + this.WEIGHT_LLM_QA_ACCURACY + this.WEIGHT_OPTIONAL_COMPLETENESS);

        //* --- Warning deductions ---
        const warningPenalty = Math.min(
            validationResult.warningCount * this.WARNING_PENALTY,
            this.MAX_WARNING_PENALTY
        );

        const finalScore = Math.min(1.0, Math.max(0.0, normalisedScore - warningPenalty));

        const breakdown: ScoreBreakdown = {
            criticalFieldsPresence: criticalScore,
            llmQAAccuracy: qaScore,
            optionalFieldsCompleteness: optionalScore,
            penaltyDeductions: warningPenalty,
            finalScore,
        };

        //* --- Routing decision ---
        const routing = this.route(finalScore, qaRecoverable, maxIterationsHit, validationResult.passed);

        return { breakdown, routing };
    }


    //* -------------------------------------------------------------------------- */
    //*                             ROUTE METHOD                                   */
    //* -------------------------------------------------------------------------- */
    private static route(
        finalScore: number,
        qaRecoverable: boolean,
        maxIterationsHit: boolean,
        layer1Passed: boolean,
    ): RoutingDecision {

        //* If Layer 1 failed (critical fields missing) and QA wants another try → requeue
        if (!layer1Passed && qaRecoverable && !maxIterationsHit) {
            return RoutingDecision.REQUEUE;
        }

        //* QA found correctable issues and we still have iterations left → requeue
        if (qaRecoverable && !maxIterationsHit) {
            return RoutingDecision.REQUEUE;
        }

        //* Score-based routing (applies when max iterations hit or QA passed)
        if (finalScore >= this.THRESHOLD_AUTO_APPROVE) {
            return RoutingDecision.AUTO_APPROVE;
        }

        if (finalScore >= this.THRESHOLD_SOFT_FLAG) {
            return RoutingDecision.SOFT_FLAG;
        }

        if (finalScore >= this.THRESHOLD_HUMAN_REVIEW) {
            return RoutingDecision.HUMAN_REVIEW;
        }

        return RoutingDecision.DEAD_LETTER;
    }

}

export default DocumentScorer;
