import { z } from "zod";
import InvoicesPrompt from "../prompts/invoicesPrompt";
import { LLMClientFactory } from "../llms/llmClientFactory";


const InvoiceLineItemSchema = z.object({
    itemName: z.string(),
    itemCost: z.number().nullable(),
    mappedCostCode: z.string().nullable(),
    currency: z.string().nullable()
});

const InvoiceAnalysisSchema = z.object({
    confidence: z.number().min(0).max(1),
    vendor: z.string().nullable(),
    invoiceNumber: z.string().nullable(),
    invoiceDate: z.string().nullable(),
    invoiceDueDate: z.string().nullable(),
    amount: z.number().nullable(),
    currency: z.string().nullable(),
    job: z.string().nullable(),
    lineItems: z.array(InvoiceLineItemSchema),
    notes: z.string().nullable()
});


class InvoicesChain {

    public static invoiceAnalysisChain() {
        const invoicePromptTemplate = InvoicesPrompt.getInvoiceAnalysisPromptTemplate();
        const model = LLMClientFactory.getLLMClient().getLLMInstance(0.3);
        const structuredModel = model.withStructuredOutput(InvoiceAnalysisSchema, {
            name: "invoice_analysis"
        });
        const chain = invoicePromptTemplate.pipe(structuredModel);
        return chain;
    }

}

export default InvoicesChain;
