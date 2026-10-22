import { z } from "zod";
import ComplianceAlertsQAPrompt from "../prompts/complianceAlertsQAPrompt";
import { LLMClientFactory } from "../llms/llmClientFactory";


const ComplianceQAResultSchema = z.object({
    pass: z.boolean(),
    reasoning: z.string(),
    critique: z.array(z.string()),
    confidence: z.number().min(0).max(1)
});


class ComplianceAlertsQAChain {

    public static complianceQAChain() {
        const complianceQAPromptTemplate = ComplianceAlertsQAPrompt.getComplianceQAPromptTemplate();
        const model = LLMClientFactory.getLLMClient().getQALLMInstance(0.1);
        const structuredModel = model.withStructuredOutput(ComplianceQAResultSchema, {
            name: "compliance_qa_result"
        });
        const chain = complianceQAPromptTemplate.pipe(structuredModel);
        return chain;
    }

}

export default ComplianceAlertsQAChain;
