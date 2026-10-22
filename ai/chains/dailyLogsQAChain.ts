import { z } from "zod";
import DailyLogsQAPrompt from "../prompts/dailyLogsQAPrompt";
import { LLMClientFactory } from "../llms/llmClientFactory";


const DailyLogQAResultSchema = z.object({
    pass: z.boolean(),
    reasoning: z.string(),
    critique: z.array(z.string()),
    confidence: z.number().min(0).max(1)
});


class DailyLogsQAChain {

    public static dailyLogQAChain() {
        const dailyLogQAPromptTemplate = DailyLogsQAPrompt.getDailyLogQAPromptTemplate();
        const model = LLMClientFactory.getLLMClient().getQALLMInstance(0.1);
        const structuredModel = model.withStructuredOutput(DailyLogQAResultSchema, {
            name: "daily_log_qa_result"
        });
        const chain = dailyLogQAPromptTemplate.pipe(structuredModel);
        return chain;
    }

}

export default DailyLogsQAChain;
