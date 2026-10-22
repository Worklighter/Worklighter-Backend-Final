import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { LLMResult } from "@langchain/core/outputs";
import { ITokenConsumptionReceipt, ITokenModelUsage } from "../../modules/emailSubmissions/emailSubmissionsInterface";


class TokenUsageHandler extends BaseCallbackHandler {
    name = "TokenUsageHandler";

    private readonly modelName: string;
    private inputTokens: number = 0;
    private outputTokens: number = 0;

    constructor(modelName: string) {
        super();
        this.modelName = modelName;
    }


    //* -------------------------------------------------------------------------- */
    //*                         HANDLE LLM END METHOD                              */
    //* Fires after every LLM call within the graph (extraction + QA nodes)        */
    //* -------------------------------------------------------------------------- */
    async handleLLMEnd(output: LLMResult): Promise<void> {
        const usage = output.llmOutput?.tokenUsage;
        if (usage) {
            this.inputTokens += usage.promptTokens || 0;
            this.outputTokens += usage.completionTokens || 0;
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                         GET TOKEN USAGE METHOD                             */
    //* -------------------------------------------------------------------------- */
    public getTokenUsage(): ITokenModelUsage {
        return {
            model: this.modelName,
            inputTokens: this.inputTokens,
            outputTokens: this.outputTokens,
        };
    }


    //* -------------------------------------------------------------------------- */
    //*                         GET TOKEN RECEIPT METHOD                           */
    //* Convenience wrapper — returns a top-level receipt from this handler alone  */
    //* -------------------------------------------------------------------------- */
    public getTokenReceipt(): ITokenConsumptionReceipt {
        return {
            inputTokens: this.inputTokens,
            outputTokens: this.outputTokens,
            totalUsage: this.inputTokens + this.outputTokens,
        };
    }
}

export default TokenUsageHandler;
