import { z } from "zod";
import ComplianceAlertsPrompt from "../prompts/complianceAlertsPrompt";
import { LLMClientFactory } from "../llms/llmClientFactory";


const CoverageItemSchema = z.object({
    coveredProperty: z.string(),
    amountOfInsurance: z.string(),
});

const ComplianceAnalysisSchema = z.object({
    confidence: z.number().min(0).max(1),
    vendor: z.string().nullable(),
    certificate: z.string().nullable(),
    documentType: z.string().nullable(),
    insurer: z.string().nullable(),
    policyNumber: z.array(z.string().nullable()).nullable().transform(arr =>
        arr ? arr.filter((p): p is string => p !== null && p.trim() !== '') : null
    ),
    effectiveDate: z.string().nullable(),
    expirationDate: z.string().nullable(),
    coverage: z.array(CoverageItemSchema).nullable(),
});


class ComplianceAlertsChain {

    public static complianceAnalysisChain() {
        const compliancePromptTemplate = ComplianceAlertsPrompt.getComplianceAnalysisPromptTemplate();
        const model = LLMClientFactory.getLLMClient().getLLMInstance(0.2);
        const structuredModel = model.withStructuredOutput(ComplianceAnalysisSchema, {
            name: "compliance_analysis"
        });
        const chain = compliancePromptTemplate.pipe(structuredModel);
        return chain;
    }

}

export default ComplianceAlertsChain;
