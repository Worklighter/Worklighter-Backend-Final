import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { Runnable } from "@langchain/core/runnables";
import { DocumentReflectionSettings } from "../../utils/constants";
import TokenUsageHandler from "../../utils/helpers/tokenUsageHandler";
import { ITokenConsumptionReceipt } from "../../modules/emailSubmissions/emailSubmissionsInterface";
import { ValidationIssue } from "../../ai/validators/invoicesValidator";
import { RoutingDecision, ScoreBreakdown } from "../../ai/scorers/documentScorer";


export interface DocumentGraphResult {
    extractedData: any | null;
    confidenceScore: number;
    flaggedForHumanReview: boolean;
    iterationCount: number;
    tokenConsumptionReceipt: ITokenConsumptionReceipt;
    qaCritique: string[];
    qaReasoning: string;
    //* Layer 1 + scoring enrichment — populated by agents, not the raw graph
    validationIssues: ValidationIssue[];
    routingDecision: RoutingDecision;
    scoreBreakdown: ScoreBreakdown | null;
}


const GraphState = Annotation.Root({
    documentContent: Annotation<string>({
        reducer: (_x, y) => y,
        default: () => '',
    }),
    extractedData: Annotation<any>({
        reducer: (_x, y) => y,
        default: () => null,
    }),
    //* Tracks the FIRST successful extraction — unaffected by later critique-enriched re-extractions.
    //* Used as the preserved data when flaggedForHumanReview=true, because the 3rd-iteration
    //* extraction (with accumulated critique context) can cause the LLM to null out all fields.
    firstExtractedData: Annotation<any>({
        reducer: (x, y) => (x !== null ? x : y),   // first-write-wins — never overwritten once set
        default: () => null,
    }),
    qaCritique: Annotation<string[]>({
        reducer: (_x, y) => y,
        default: () => [],
    }),
    qaReasoning: Annotation<string>({
        reducer: (_x, y) => y,
        default: () => '',
    }),
    iterationCount: Annotation<number>({
        reducer: (_x, y) => y,
        default: () => 0,
    }),
    confidenceScore: Annotation<number>({
        reducer: (_x, y) => y,
        default: () => 0,
    }),
    flaggedForHumanReview: Annotation<boolean>({
        reducer: (_x, y) => y,
        default: () => false,
    }),
});


//* -------------------------------------------------------------------------- */
//*                    RUN DOCUMENT REFLECTION GRAPH FUNCTION                  */
//* -------------------------------------------------------------------------- */
export async function runDocumentReflectionGraph(
    documentContent: string,
    extractionChain: Runnable,
    qaChain: Runnable,
    extractionModelName: string,
    qaModelName: string,
): Promise<DocumentGraphResult> {

    //* Two dedicated token handlers — one per model role, labelled with deployment names.
    const extractionTokenHandler = new TokenUsageHandler(extractionModelName);
    const qaTokenHandler = new TokenUsageHandler(qaModelName);

    //* Node: Extraction Agent
    //* On retry runs, the original document content is enriched with the QA critique
    //* so the extraction agent can self-correct targeted issues without prompt changes
    const extractionNode = async (state: typeof GraphState.State) => {
        const enrichedContent = state.qaCritique.length > 0
            ? `${state.documentContent}\n\n[QA CRITIQUE — Correct these specific issues in your re-extraction:\n${state.qaCritique.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n]`
            : state.documentContent;

        const result = await extractionChain.invoke(
            { documentContent: enrichedContent },
            { callbacks: [extractionTokenHandler] },
        );

        return {
            extractedData: result,
            //* firstExtractedData uses a first-write-wins reducer — subsequent writes are ignored.
            //* This preserves the original (uncorrupted) extraction in case later iterations
            //* produce degraded output due to accumulated critique context confusing the LLM.
            firstExtractedData: result,
            iterationCount: state.iterationCount + 1,
        };
    };

    //* Node: QA / Inspector Agent
    //* Receives original document + extracted JSON, validates correctness and completeness
    const qaNode = async (state: typeof GraphState.State) => {
        const qaResult = await qaChain.invoke(
            {
                documentContent: state.documentContent,
                extractedData: JSON.stringify(state.extractedData, null, 2),
            },
            { callbacks: [qaTokenHandler] },
        );

        const maxIterationsReached = state.iterationCount >= DocumentReflectionSettings.MAX_ITERATIONS;

        return {
            //* Explicitly carry extractedData forward — guards against any annotation edge case
            //* where channels not in a node's return could be reset by the LangGraph runtime.
            extractedData: state.extractedData,
            qaCritique: qaResult.pass ? [] : qaResult.critique,
            qaReasoning: qaResult.reasoning,
            confidenceScore: qaResult.confidence,
            flaggedForHumanReview: !qaResult.pass && maxIterationsReached,
        };
    };

    //* Conditional Edge: Determine next step after QA
    const shouldContinue = (state: typeof GraphState.State): string => {
        if (state.qaCritique.length === 0) return END;                                          // QA passed — done
        if (state.iterationCount >= DocumentReflectionSettings.MAX_ITERATIONS) return END;      // Max iterations hit — flagged for human review
        return "extractionNode";                                                                 // Re-run extraction with critique
    };

    const graph = new StateGraph(GraphState)
        .addNode("extractionNode", extractionNode)
        .addNode("qaNode", qaNode)
        .addEdge(START, "extractionNode")
        .addEdge("extractionNode", "qaNode")
        .addConditionalEdges("qaNode", shouldContinue)
        .compile();

    const finalState = await graph.invoke({ documentContent });

    //* When flaggedForHumanReview=true (QA failed all iterations), the last extraction was
    //* done with accumulated critique context which can cause the LLM to null out all fields.
    //* In that case, fall back to firstExtractedData (the original, uncorrupted extraction)
    //* so the reviewer always has the best available data to work from.
    const extractedData = finalState.flaggedForHumanReview
        ? (finalState.firstExtractedData ?? finalState.extractedData)
        : finalState.extractedData;

    //* Merge per-model token usage into a single combined receipt with breakdown
    const extractionUsage = extractionTokenHandler.getTokenUsage();
    const qaUsage = qaTokenHandler.getTokenUsage();
    const tokenConsumptionReceipt = {
        inputTokens:  extractionUsage.inputTokens  + qaUsage.inputTokens,
        outputTokens: extractionUsage.outputTokens + qaUsage.outputTokens,
        totalUsage:   extractionUsage.inputTokens  + qaUsage.inputTokens +
                      extractionUsage.outputTokens + qaUsage.outputTokens,
        extraction: extractionUsage,
        qa:         qaUsage,
    };

    return {
        extractedData,
        confidenceScore: finalState.confidenceScore,
        flaggedForHumanReview: finalState.flaggedForHumanReview,
        iterationCount: finalState.iterationCount,
        tokenConsumptionReceipt,
        qaCritique: finalState.qaCritique,
        qaReasoning: finalState.qaReasoning,
        //* Populated by agents (Layer 1 validators + scorer) — default values until enriched
        validationIssues: [],
        routingDecision: RoutingDecision.HUMAN_REVIEW,
        scoreBreakdown: null,
    };
}
