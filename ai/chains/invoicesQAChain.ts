import { z } from "zod";
import InvoicesQAPrompt from "../prompts/invoicesQAPrompt";
import { LLMClientFactory } from "../llms/llmClientFactory";


const InvoiceQAResultSchema = z.object({
    pass: z.boolean(),
    reasoning: z.string(),
    critique: z.array(z.string()),
    confidence: z.number().min(0).max(1).default(1.0)
});


class InvoicesQAChain {

    public static invoiceQAChain() {
        const invoiceQAPromptTemplate = InvoicesQAPrompt.getInvoiceQAPromptTemplate();
        const model = LLMClientFactory.getLLMClient().getQALLMInstance(0.1);
        const structuredModel = model.withStructuredOutput(InvoiceQAResultSchema, {
            name: "invoice_qa_result"
        });
        const chain = invoiceQAPromptTemplate.pipe(structuredModel);
        return chain;
    }

}

export default InvoicesQAChain;
