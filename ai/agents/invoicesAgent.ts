import InvoicesGraph from "../graphs/invoicesGraph";
import InvoicesValidator from "../validators/invoicesValidator";
import DocumentScorer, { RoutingDecision } from "../scorers/documentScorer";
import { DocumentGraphResult } from "../graphs/documentReflectionGraph";
import { sanitizeInvoiceExtraction } from "../utils/extractionSanitizer";


//* -------------------------------------------------------------------------- */
//*                             INVOICES AGENT                                 */
//* -------------------------------------------------------------------------- */
//* Orchestrates the full 3-layer QA pipeline for invoice documents:
//*   Layer 1 — Structural validator  (sync, runs before and after graph)
//*   Layer 2 — LLM reflection graph  (async, reflect-and-correct loop)
//*   Layer 3 — Weighted scorer       (sync, emits final routing decision)
//*
//* The agent is the single public entry-point consumed by the job processor.
//* It returns an enriched DocumentGraphResult with validationIssues and
//* routingDecision already populated — callers do not touch the graph directly.

abstract class InvoicesAgent {

    //* -------------------------------------------------------------------------- */
    //*                               RUN METHOD                                   */
    //* -------------------------------------------------------------------------- */
    public static async run(documentContent: string): Promise<DocumentGraphResult> {

        //* --- Layer 2: LLM reflection graph (extraction + QA iterate) ---
        const graphResult = await InvoicesGraph.run(documentContent);

        //* --- OCR artifact sanitizer: normalize field values before validation ---
        graphResult.extractedData = sanitizeInvoiceExtraction(graphResult.extractedData);

        //* --- Layer 1: Structural validator (post-extraction) ---
        const validationResult = InvoicesValidator.validate(graphResult.extractedData);

        //* --- Layer 3: Weighted scorer + routing decision ---
        //*
        //* Optional fields provided to measure completeness (10% weight):
        //*   invoiceDate, invoiceDueDate, job, notes, currency
        const optionalFields = graphResult.extractedData ? [
            graphResult.extractedData.invoiceDate,
            graphResult.extractedData.invoiceDueDate,
            graphResult.extractedData.job,
            graphResult.extractedData.notes,
            graphResult.extractedData.currency,
        ] : [];

        //* qaRecoverable = QA issued critique and we did not exhaust iterations
        //* (iterations < max means the loop exited because QA passed on its own)
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

export default InvoicesAgent;
