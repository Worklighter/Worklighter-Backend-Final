import { ChatPromptTemplate } from "@langchain/core/prompts";
import DocumentTypes from "../../core/enums/documentTypes";
import ReviewQueues from "../../core/enums/reviewQueues";


class DocumentClassifierPrompt {

    public getClassifierPromptTemplate() {
        const classifierPromptTemplate = ChatPromptTemplate.fromMessages([
            ["system", `
                You are a document classification specialist for construction project management.
                Your sole job is to identify the type of document contained in the provided text.

                **Document types:**
                - ${DocumentTypes.INVOICE}: A vendor bill listing goods or services rendered, amounts, line items, payment terms, and usually a unique invoice number.
                - ${DocumentTypes.COI}: Certificate of Insurance — lists an insurer, policy numbers, coverage types (general liability, workers comp, auto, umbrella), effective and expiration dates, and a certificate holder name.
                - ${DocumentTypes.DAILY_LOG}: A construction daily log or field report — lists date, crew members or superintendent, tasks performed, equipment used, and hours worked on site.
                - ${DocumentTypes.UNKNOWN}: Cannot be confidently classified into any of the above three categories.

                **Critical Rules:**
                1. Base your classification solely on the document content. Do not guess from a filename.
                2. Choose the single best matching type per document.
                3. A confidence below 0.5 indicates the document is genuinely ambiguous — use '${DocumentTypes.UNKNOWN}' in that case.
                4. Only populate suggestedQueue when documentType is a known type (not '${DocumentTypes.UNKNOWN}').
                5. Return valid JSON only — no markdown fences, no text outside the JSON object.

                **suggestedQueue values — use these exact strings:**
                - ${DocumentTypes.INVOICE}    → "${ReviewQueues.INVOICES}"
                - ${DocumentTypes.COI}        → "${ReviewQueues.COMPLIANCE_ALERT}"
                - ${DocumentTypes.DAILY_LOG}  → "${ReviewQueues.DAILY_LOGS}"
                - ${DocumentTypes.UNKNOWN}    → null

                **Return format:**
                {{
                    "documentType": "${DocumentTypes.INVOICE}" | "${DocumentTypes.COI}" | "${DocumentTypes.DAILY_LOG}" | "${DocumentTypes.UNKNOWN}",
                    "confidence": number (0–1),
                    "suggestedQueue": string | null
                }}

                **Document Content:**
                {documentContent}
            `]
        ]);

        return classifierPromptTemplate;
    }

}


export default new DocumentClassifierPrompt();
