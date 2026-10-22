import ComplianceAlertsGraph from "../graphs/complianceAlertsGraph";
import ComplianceAlertsValidator from "../validators/complianceAlertsValidator";
import DocumentScorer from "../scorers/documentScorer";
import { DocumentGraphResult } from "../graphs/documentReflectionGraph";
import { sanitizeComplianceExtraction } from "../utils/extractionSanitizer";


//* -------------------------------------------------------------------------- */
//*                        COMPLIANCE ALERTS AGENT                             */
//* -------------------------------------------------------------------------- */
//* Orchestrates the full 3-layer QA pipeline for COI / compliance documents:
//*   Layer 1 — Structural validator  (sync, post-extraction)
//*   Layer 2 — LLM reflection graph  (async, reflect-and-correct loop)
//*   Layer 3 — Weighted scorer       (sync, emits final routing decision)

abstract class ComplianceAlertsAgent {

    //* -------------------------------------------------------------------------- */
    //*                               RUN METHOD                                   */
    //* -------------------------------------------------------------------------- */
    public static async run(documentContent: string): Promise<DocumentGraphResult> {

        //* --- Layer 2: LLM reflection graph ---
        const graphResult = await ComplianceAlertsGraph.run(documentContent);

        //* --- OCR artifact sanitizer: normalize field values before validation ---
        graphResult.extractedData = sanitizeComplianceExtraction(graphResult.extractedData);

        //* --- Layer 1: Structural validator ---
        const validationResult = ComplianceAlertsValidator.validate(graphResult.extractedData);

        //* --- Layer 3: Weighted scorer + routing decision ---
        //*
        //* Optional fields: certificate, documentType, insurer, policyNumber,
        //*                  effectiveDate, coverage
        const optionalFields = graphResult.extractedData ? [
            graphResult.extractedData.certificate,
            graphResult.extractedData.documentType,
            graphResult.extractedData.insurer,
            graphResult.extractedData.policyNumber,
            graphResult.extractedData.effectiveDate,
            graphResult.extractedData.coverage,
        ] : [];

        const qaRecoverable = graphResult.qaCritique.length > 0 && !graphResult.flaggedForHumanReview;
        const maxIterationsHit = graphResult.flaggedForHumanReview;

        const { breakdown, routing } = DocumentScorer.score(
            validationResult,
            graphResult.confidenceScore,
            optionalFields,
            qaRecoverable,
            maxIterationsHit,
        );

        return {
            ...graphResult,
            validationIssues: validationResult.issues,
            routingDecision: routing,
            scoreBreakdown: breakdown,
        };
    }

}

export default ComplianceAlertsAgent;
