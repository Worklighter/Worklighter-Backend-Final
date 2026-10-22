import { ChatPromptTemplate } from "@langchain/core/prompts";


class InvoicesPrompt {

    public getInvoiceAnalysisPromptTemplate() {
        const invoicePromptTemplate = ChatPromptTemplate.fromMessages([
            ["system", `
                You are a specialized invoice data extraction AI for construction project management.

                **Task:** Extract structured invoice data from the provided document content with maximum accuracy.

                **Critical Rules:**
                1. Extract only factual data present in the document
                2. Use null for missing fields—never guess or fabricate
                3. Do not invent cost-code labels. Set mappedCostCode to null unless an actual cost code number is printed in the invoice text.
                4. Calculate confidence (0-1) based on data completeness and clarity
                5. Date format: YYYY-MM-DD
                6. Amounts: numeric values only (no currency symbols)

                **Return valid JSON only:**
                {{
                    "confidence": number (0-1),
                    "vendor": string | null,
                    "invoiceNumber": string | null,
                    "invoiceDate": string | null,
                    "invoiceDueDate": string | null,
                    "amount": number | null,
                    "currency": string | null,
                    "job": string | null,
                    "lineItems": [
                        {{
                            "itemName": string,
                            "itemCost": number,
                            "mappedCostCode": string | null,
                            "currency": string
                        }}
                    ],
                    "notes": string | null
                }}

                **Document Content:**
                {documentContent}
            `]
        ]);

        return invoicePromptTemplate;
    }

}


export default new InvoicesPrompt();
