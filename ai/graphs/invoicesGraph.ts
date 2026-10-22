import InvoicesChain from "../chains/invoicesChain";
import InvoicesQAChain from "../chains/invoicesQAChain";
import { runDocumentReflectionGraph, DocumentGraphResult } from "./documentReflectionGraph";
import { LLMClientFactory } from "../llms/llmClientFactory";


class InvoicesGraph {

    //* -------------------------------------------------------------------------- */
    //*                               RUN METHOD                                   */
    //* -------------------------------------------------------------------------- */
    public static async run(documentContent: string): Promise<DocumentGraphResult> {
        const client = LLMClientFactory.getLLMClient();
        const extractionChain = InvoicesChain.invoiceAnalysisChain();
        const qaChain = InvoicesQAChain.invoiceQAChain();
        return runDocumentReflectionGraph(
            documentContent,
            extractionChain,
            qaChain,
            client.getDeploymentName(),
            client.getQADeploymentName(),
        );
    }

}

export default InvoicesGraph;
