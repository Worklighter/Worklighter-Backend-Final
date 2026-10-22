import { AzureChatOpenAI } from "@langchain/openai";
import { Application } from "../../app";
import { ILLMClient } from "../../core/interfaces/generalInterface";

class AzureGPTClient implements ILLMClient {

    public getLLMInstance(temperature: number) {
        return new AzureChatOpenAI({
            azureOpenAIEndpoint: Application.conf.SERVICES.llm.azureGPT.endpoint,
            azureOpenAIApiDeploymentName: Application.conf.SERVICES.llm.azureGPT.deploymentName,
            azureOpenAIApiVersion: Application.conf.SERVICES.llm.azureGPT.apiVersion,
            azureOpenAIApiKey: Application.conf.SERVICES.llm.azureGPT.apiKey,
            temperature,
        });
    }

    //* Uses the dedicated QA deployment (lawli-gpt4o) when configured.
    //* Falls back to the extraction deployment if AI_QA_MODEL_DEPLOYMENT_NAME is not set.
    public getQALLMInstance(temperature: number) {
        const qaDeployment = Application.conf.SERVICES.llm.azureGPT.qaDeploymentName
            || Application.conf.SERVICES.llm.azureGPT.deploymentName;
        return new AzureChatOpenAI({
            azureOpenAIEndpoint: Application.conf.SERVICES.llm.azureGPT.endpoint,
            azureOpenAIApiDeploymentName: qaDeployment,
            azureOpenAIApiVersion: Application.conf.SERVICES.llm.azureGPT.apiVersion,
            azureOpenAIApiKey: Application.conf.SERVICES.llm.azureGPT.apiKey,
            temperature,
        });
    }

    public getDeploymentName(): string {
        return Application.conf.SERVICES.llm.azureGPT.deploymentName;
    }

    public getQADeploymentName(): string {
        return Application.conf.SERVICES.llm.azureGPT.qaDeploymentName
            || Application.conf.SERVICES.llm.azureGPT.deploymentName;
    }

}

export default AzureGPTClient;