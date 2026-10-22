import ComplianceAlertsChain from "../chains/complianceAlertsChain";
import ComplianceAlertsQAChain from "../chains/complianceAlertsQAChain";
import { runDocumentReflectionGraph, DocumentGraphResult } from "./documentReflectionGraph";
import { LLMClientFactory } from "../llms/llmClientFactory";


class ComplianceAlertsGraph {

    //* -------------------------------------------------------------------------- */
    //*                               RUN METHOD                                   */
    //* -------------------------------------------------------------------------- */
    public static async run(documentContent: string): Promise<DocumentGraphResult> {
        const client = LLMClientFactory.getLLMClient();
        const extractionChain = ComplianceAlertsChain.complianceAnalysisChain();
        const qaChain = ComplianceAlertsQAChain.complianceQAChain();
        return runDocumentReflectionGraph(
            documentContent,
            extractionChain,
            qaChain,
            client.getDeploymentName(),
            client.getQADeploymentName(),
        );
    }

}

export default ComplianceAlertsGraph;
