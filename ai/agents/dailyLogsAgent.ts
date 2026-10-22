import DailyLogsGraph from "../graphs/dailyLogsGraph";
import DailyLogsValidator from "../validators/dailyLogsValidator";
import DocumentScorer from "../scorers/documentScorer";
import { DocumentGraphResult } from "../graphs/documentReflectionGraph";
import { sanitizeDailyLogExtraction } from "../utils/extractionSanitizer";
import { calculateCrewHours } from "../../utils/helpers/crewHoursCalculator";


//* -------------------------------------------------------------------------- */
//*                           DAILY LOGS AGENT                                 */
//* -------------------------------------------------------------------------- */
//* Orchestrates the full 3-layer QA pipeline for daily log documents:
//*   Layer 1 — Structural validator  (sync, post-extraction)
//*   Layer 2 — LLM reflection graph  (async, reflect-and-correct loop)
//*   Layer 3 — Weighted scorer       (sync, emits final routing decision)

abstract class DailyLogsAgent {

    //* -------------------------------------------------------------------------- */
    //*                               RUN METHOD                                   */
    //* -------------------------------------------------------------------------- */
    public static async run(documentContent: string): Promise<DocumentGraphResult> {

        //* --- Layer 2: LLM reflection graph ---
        const graphResult = await DailyLogsGraph.run(documentContent);

        //* --- OCR artifact sanitizer: normalize field values before validation ---
        graphResult.extractedData = sanitizeDailyLogExtraction(graphResult.extractedData);

        //* --- Crew hours calculator: pure code computes totalCrewHours from rawHours ---
        //* The LLM extracted rawHours verbatim (decimal or time range strings).
        //* We parse and sum here so the LLM never touches the arithmetic.
        if (graphResult.extractedData) {
            const crew = Array.isArray(graphResult.extractedData.crew) ? graphResult.extractedData.crew : [];
            if (crew.length > 0) {
                const { totalCrewHours } = calculateCrewHours(crew);
                graphResult.extractedData.totalCrewHours = totalCrewHours;
            } else {
                graphResult.extractedData.totalCrewHours = null;
            }
        }

        //* --- Layer 1: Structural validator ---
        const validationResult = DailyLogsValidator.validate(graphResult.extractedData);

        //* --- Layer 3: Weighted scorer + routing decision ---
        //*
        //* Optional fields: superintendent, job, equipment
        const optionalFields = graphResult.extractedData ? [
            graphResult.extractedData.superintendent,
            graphResult.extractedData.job,
            graphResult.extractedData.equipment,
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

export default DailyLogsAgent;
