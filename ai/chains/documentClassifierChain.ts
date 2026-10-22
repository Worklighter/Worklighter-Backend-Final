import { z } from "zod";
import DocumentClassifierPrompt from "../prompts/documentClassifierPrompt";
import { LLMClientFactory } from "../llms/llmClientFactory";
import DocumentTypes from "../../core/enums/documentTypes";


const ClassifierSchema = z.object({
    documentType: z.nativeEnum(DocumentTypes),
    confidence: z.number().min(0).max(1),
    suggestedQueue: z.string().nullable(),
});

export type ClassifierOutput = z.infer<typeof ClassifierSchema>;


class DocumentClassifierChain {

    public static classifierChain() {
        const promptTemplate = DocumentClassifierPrompt.getClassifierPromptTemplate();
        const model = LLMClientFactory.getLLMClient().getLLMInstance(0.1);
        const structuredModel = model.withStructuredOutput(ClassifierSchema, {
            name: "document_classifier"
        });
        const chain = promptTemplate.pipe(structuredModel);
        return chain;
    }

}

export default DocumentClassifierChain;
