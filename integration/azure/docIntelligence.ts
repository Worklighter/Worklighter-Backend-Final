import DocumentIntelligenceClient, {
    getLongRunningPoller,
    AnalyzeResultOutput
} from "@azure-rest/ai-document-intelligence";
import { AzureKeyCredential } from "@azure/core-auth";
import { Logger } from "../../utils/helpers/logger";

interface AnalyzeResult {
    content: string;
    pages: string[];
    averageConfidence: number;
    minConfidence: number;
    maxConfidence: number;
    wordCount: number;
}

interface AzureConfig {
    endpoint: string;
    apiKey: string;
}

export class AzureDocumentIntelligenceService {
    private static instance: AzureDocumentIntelligenceService;
    private client: ReturnType<typeof DocumentIntelligenceClient>;
    private config: AzureConfig | null = null;


    //* -------------------------------------------------------------------------- */
    //*                           CONSTRUCTOR METHOD                               */
    //* -------------------------------------------------------------------------- */
    private constructor() { }


    //* -------------------------------------------------------------------------- */
    //*                           INITIALIZE METHOD                                */
    //* -------------------------------------------------------------------------- */
    public static async init(config: AzureConfig): Promise<void> {
        if (!this.instance) {
            this.instance = new AzureDocumentIntelligenceService();
        }

        try {
            this.instance.config = config;
            this.instance.client = DocumentIntelligenceClient(
                config.endpoint,
                new AzureKeyCredential(config.apiKey)
            );
            Logger.Console(`Connected to Azure Document Intelligence: ${config.endpoint}`, 'info');
        } catch (error) {
            Logger.Console(`Failed to initialize Azure Document Intelligence: ${error.message}`, 'error');
            throw error;
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                          GET INSTANCE METHOD                               */
    //* -------------------------------------------------------------------------- */
    public static getInstance(): AzureDocumentIntelligenceService {
        if (!this.instance) {
            throw new Error("AzureDocumentIntelligenceService not initialized. Call init() first.");
        }
        return this.instance;
    }


    //* -------------------------------------------------------------------------- */
    //*                         ANALYZE DOCUMENT METHOD                            */
    //* -------------------------------------------------------------------------- */
    public async analyzeDocument(fileBuffer: Buffer): Promise<AnalyzeResult> {
        try {
            if (!this.client) {
                throw new Error("Document Intelligence client not initialized");
            }
            
            const initialResponse = await this.client
                .path("/documentModels/{modelId}:analyze", "prebuilt-layout")
                .post({
                    contentType: "application/octet-stream",
                    body: fileBuffer,
                    queryParameters: {
                        outputContentFormat: "markdown",
                        features: ["keyValuePairs"]
                    }
                });

            if (initialResponse.status !== "202") {
                throw new Error(`Failed to start analysis. Status: ${initialResponse.status}`);
            }

            const poller = getLongRunningPoller(this.client, initialResponse);
            const finalResponse = await poller.pollUntilDone();
            
            const result = finalResponse.body as any;
            const analyzeResult = result.analyzeResult as AnalyzeResultOutput;
            
            if (!analyzeResult) {
                throw new Error('Invalid response structure - missing analyzeResult');
            }

            return this.extractConfidence(analyzeResult);
        } catch (error) {
            Logger.Console(`Error analyzing document: ${error.message}`, 'error');
            throw error;
        }
    }


    //* -------------------------------------------------------------------------- */
    //*                       EXTRACT CONFIDENCE METHOD                            */
    //* -------------------------------------------------------------------------- */
    private extractConfidence(result: AnalyzeResultOutput): AnalyzeResult {
        const content = result.content ?? "";

        //* Extract per-page text by slicing the merged content string using each page's character spans
        const pages: string[] = (result.pages ?? []).map(page => {
            if (!page.spans || page.spans.length === 0) return '';
            return (page.spans as any[])
                .map((span: any) => content.substring(span.offset, span.offset + span.length))
                .join('');
        });

        const words = result.pages?.flatMap(page => page.words ?? []) ?? [];

        if (!words.length) {
            return {
                content,
                pages,
                averageConfidence: 0,
                minConfidence: 0,
                maxConfidence: 0,
                wordCount: 0
            };
        }

        let sum = 0;
        let min = 1;
        let max = 0;

        for (const word of words) {
            const confidence = word.confidence ?? 0;
            sum += confidence;
            if (confidence < min) min = confidence;
            if (confidence > max) max = confidence;
        }

        const avg = sum / words.length;

        return {
            content,
            pages,
            averageConfidence: Number(avg.toFixed(4)),
            minConfidence: Number(min.toFixed(4)),
            maxConfidence: Number(max.toFixed(4)),
            wordCount: words.length
        };
    }
}