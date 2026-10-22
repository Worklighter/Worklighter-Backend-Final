import DailyLogsChain from "../chains/dailyLogsChain";
import DailyLogsQAChain from "../chains/dailyLogsQAChain";
import { runDocumentReflectionGraph, DocumentGraphResult } from "./documentReflectionGraph";
import { LLMClientFactory } from "../llms/llmClientFactory";


class DailyLogsGraph {

    //* -------------------------------------------------------------------------- */
    //*                               RUN METHOD                                   */
    //* -------------------------------------------------------------------------- */
    public static async run(documentContent: string): Promise<DocumentGraphResult> {
        const client = LLMClientFactory.getLLMClient();
        const extractionChain = DailyLogsChain.dailyLogAnalysisChain();
        const qaChain = DailyLogsQAChain.dailyLogQAChain();
        return runDocumentReflectionGraph(
            documentContent,
            extractionChain,
            qaChain,
            client.getDeploymentName(),
            client.getQADeploymentName(),
        );
    }

}

export default DailyLogsGraph;
