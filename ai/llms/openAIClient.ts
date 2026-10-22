import { ChatOpenAI } from "@langchain/openai";
import { Application } from "../../app";
import { ILLMClient } from "../../core/interfaces/generalInterface";

class OpenAIGPTClient implements ILLMClient {

    public getLLMInstance(temperature: number) {
        return new ChatOpenAI({
            openAIApiKey: Application.conf.SERVICES.llm.openAIGPT.apiKey,
            modelName: Application.conf.SERVICES.llm.openAIGPT.deploymentName,
            temperature
        });
    }

    //* OpenAI has no separate deployment concept — QA uses the same model.
    public getQALLMInstance(temperature: number) {
        return this.getLLMInstance(temperature);
    }

    public getDeploymentName(): string {
        return Application.conf.SERVICES.llm.openAIGPT.deploymentName;
    }

    public getQADeploymentName(): string {
        return Application.conf.SERVICES.llm.openAIGPT.deploymentName;
    }

}

export default OpenAIGPTClient;