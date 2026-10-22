import { z } from "zod";
import DailyLogsPrompt from "../prompts/dailyLogsPrompt";
import { LLMClientFactory } from "../llms/llmClientFactory";


const TaskSchema = z.object({
    taskName: z.string(),
    mappedCostCode: z.string().nullable(),
    //* Only populated under Pattern A (per-task hours column in the document).
    //* null when the document only has a shared crew hours table (Pattern B/C).
    hoursWorked: z.number().nullable(),
});

const CrewMemberSchema = z.object({
    name: z.string(),
    trade: z.string(),
    //* Verbatim as printed — e.g. "8", "7.5", "8:00 to 15:38", "7:45AM - 2:57PM".
    //* The code layer converts this to decimal hours; the LLM must NOT calculate.
    rawHours: z.string(),
});

const DailyLogAnalysisSchema = z.object({
    confidence: z.number().min(0).max(1),
    date: z.string().nullable(),
    superintendent: z.string().nullable(),
    job: z.string().nullable(),
    tasks: z.array(TaskSchema),
    //* Populated when the document has a crew / labour / personnel table.
    //* Each entry copies name, trade, and rawHours verbatim from the document.
    crew: z.array(CrewMemberSchema),
    equipment: z.string().nullable(),
});


class DailyLogsChain {

    public static dailyLogAnalysisChain() {
        const dailyLogPromptTemplate = DailyLogsPrompt.getDailyLogAnalysisPromptTemplate();
        const model = LLMClientFactory.getLLMClient().getLLMInstance(0.3);
        const structuredModel = model.withStructuredOutput(DailyLogAnalysisSchema, {
            name: "daily_log_analysis"
        });
        const chain = dailyLogPromptTemplate.pipe(structuredModel);
        return chain;
    }

}

export default DailyLogsChain;
