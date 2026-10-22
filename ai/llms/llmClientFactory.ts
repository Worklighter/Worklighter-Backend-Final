import { Application } from "../../app";
import { ILLMClient } from "../../core/interfaces/generalInterface";
import AzureGPTClient from "./azureGPTClient";
import OpenAIGPTClient from "./openAIClient";


export class LLMClientFactory {
    static getLLMClient(): ILLMClient {
        const provider = Application.conf.SERVICES.llm.aiModelProvider;

        switch (provider) {
            case "azure":
                return new AzureGPTClient();

            case "openai":
            default:
                return new OpenAIGPTClient();
        }
    }
}