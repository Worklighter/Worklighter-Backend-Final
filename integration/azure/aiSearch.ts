import axios, { AxiosInstance } from "axios";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Application } from "../../app";
import { Logger } from "../../utils/helpers/logger";
import { LLMClientFactory } from "../../ai/llms/llmClientFactory";
import { KnowledgeBaseUtils } from "../../modules/knowledgeBase/knowledgeBaseUtils";
import {
    IKnowledgeBaseAskCitation,
    IKnowledgeBaseAskResponse,
    IKnowledgeBaseContentChunk,
    IKnowledgeBaseSearchResult,
    IKnowledgeBaseVectorChunk
} from "../../modules/knowledgeBase/knowledgeBaseInterface";

type IndexDocumentAction = Record<string, any> & { "@search.action": "upload" | "delete" };
type FilterValue = string | number | boolean | Array<string | number | boolean>;
export type KnowledgeBaseFilterQuery = Record<string, FilterValue>;

class AzureAISearch {

    // -------------------------------------------------------------------------
    // Singleton & State
    // -------------------------------------------------------------------------

    private static instance: AzureAISearch;
    private http: AxiosInstance;
    private indexReady: boolean = false;
    private indexReadyPromise: Promise<void> | null = null;
    private embeddingDimensionsPromise: Promise<number> | null = null;
    private actualEmbeddingDimensions: number | null = null;

    private constructor() {
        this.http = axios.create({
            timeout: 120000,
        });
    }

    public static getInstance(): AzureAISearch {
        if (!AzureAISearch.instance) {
            AzureAISearch.instance = new AzureAISearch();
        }
        return AzureAISearch.instance;
    }

    // -------------------------------------------------------------------------
    // Config Accessors
    // -------------------------------------------------------------------------

    private get searchCfg() {
        const cfg = Application?.conf?.SERVICES?.AZURE?.AI_SEARCH_SERVICE;
        if (!cfg?.endpoint || !cfg?.apiKey || !cfg?.codesIndexName) {
            throw new Error('Azure AI Search is not configured (required: AZURE_AI_SEARCH_ENDPOINT, AZURE_AI_SEARCH_API_KEY, AZURE_AI_SEARCH_WORKLIGHTER_COMCODE_COSCODE_KB_INDEX_NAME)');
        }
        return cfg;
    }

    private get embeddingCfg() {
        const cfg = Application?.conf?.SERVICES?.AZURE?.OPENAI_EMBEDDINGS;
        if (!cfg?.endpoint || !cfg?.apiKey || !cfg?.deployment) {
            throw new Error('Azure OpenAI embeddings are not configured (AZURE_OPENAI_EMBEDDING_* env keys are required)');
        }
        if (!cfg.dimensions || Number.isNaN(cfg.dimensions)) {
            throw new Error('Azure OpenAI embeddings dimensions are not configured (AZURE_OPENAI_EMBEDDING_DIMENSIONS)');
        }
        return cfg;
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    private normalizeEndpoint(endpoint: string) {
        return endpoint.replace(/\/+$/, '');
    }

    private escapeODataString(value: string) {
        return (value || '').replace(/'/g, "''");
    }

    private normalizeCodeType(type?: string | null): string | null {
        const normalized = (type || '').toLowerCase().replace(/[\s_-]/g, '');
        if (normalized === 'cost' || normalized === 'costcode' || normalized === 'costcodes') {
            return 'cost_code';
        }
        if (normalized === 'com' || normalized === 'comcode' || normalized === 'comcodes' || normalized === 'wccode' || normalized === 'wccodes' || normalized === 'compcode') {
            return 'wc_code';
        }
        return null;
    }

    private normalizeIndexName(indexName: string) {
        return (indexName || '').trim().replace(/_+/g, '-').toLowerCase();
    }

    private async getEmbeddingDimensions(): Promise<number> {
        if (this.actualEmbeddingDimensions) {
            return this.actualEmbeddingDimensions;
        }

        if (!this.embeddingDimensionsPromise) {
            this.embeddingDimensionsPromise = this.fetchEmbeddings(['dimension probe'])
                .then(embeddings => {
                    const actualDimensions = embeddings?.[0]?.length;
                    if (!actualDimensions) {
                        throw new Error('Azure OpenAI embeddings dimension probe failed');
                    }

                    const configuredDimensions = this.embeddingCfg.dimensions;
                    if (configuredDimensions !== actualDimensions) {
                        Logger.Console(
                            `Azure OpenAI embedding dimensions config mismatch. Configured ${configuredDimensions}, deployment '${this.embeddingCfg.deployment}' returned ${actualDimensions}. Using ${actualDimensions}.`,
                            'warn'
                        );
                    }

                    this.actualEmbeddingDimensions = actualDimensions;
                    return actualDimensions;
                })
                .finally(() => {
                    this.embeddingDimensionsPromise = null;
                });
        }

        return this.embeddingDimensionsPromise;
    }

    private async getIndexName() {
        const baseIndexName = this.normalizeIndexName(this.searchCfg.codesIndexName);
        if (!this.searchCfg.dimensionAwareIndex) {
            return baseIndexName;
        }

        const dimensions = await this.getEmbeddingDimensions();
        const suffix = `-d${dimensions}`;
        return baseIndexName.endsWith(suffix) ? baseIndexName : `${baseIndexName}${suffix}`;
    }

    private getSearchApiVersion() {
        return this.searchCfg.apiVersion || '2024-07-01';
    }

    private headers() {
        return {
            'api-key': this.searchCfg.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json;odata.metadata=none',
            'OData-MaxVersion': '4.0',
        };
    }

    private buildFilterExpression(userId: string, tenantId: string, filterQuery?: KnowledgeBaseFilterQuery): string {
        const clauses = [
            `user_id eq '${this.escapeODataString(userId)}'`,
            `tenant_id eq '${this.escapeODataString(tenantId)}'`,
        ];

        const allowedFilterFields: Record<string, string> = {
            code: 'code',
            codeNumber: 'code',
            code_number: 'code',
            codeType: 'code_type',
            code_type: 'code_type',
            documentId: 'document_id',
            document_id: 'document_id',
            documentName: 'document_name',
            document_name: 'document_name',
        };

        Object.entries(filterQuery || {}).forEach(([key, value]) => {
            const fieldName = allowedFilterFields[key];
            if (!fieldName || value === undefined || value === null || value === '') {
                return;
            }

            const values = Array.isArray(value) ? value : [value];
            const valueClauses = values
                .filter(item => item !== undefined && item !== null && item !== '')
                .map(item => {
                    const normalizedValue = fieldName === 'code_type'
                        ? this.normalizeCodeType(String(item)) || String(item)
                        : item;

                    if (typeof normalizedValue === 'number' || typeof normalizedValue === 'boolean') {
                        return `${fieldName} eq ${normalizedValue}`;
                    }

                    return `${fieldName} eq '${this.escapeODataString(String(normalizedValue))}'`;
                });

            if (valueClauses.length === 1) {
                clauses.push(valueClauses[0]);
            } else if (valueClauses.length > 1) {
                clauses.push(`(${valueClauses.join(' or ')})`);
            }
        });

        return clauses.join(' and ');
    }

    // -------------------------------------------------------------------------
    // Retry & Error Handling
    // -------------------------------------------------------------------------

    private getDefaultRetryAttempts(): number {
        const configured = parseInt(process.env.AZURE_AI_SEARCH_RETRY_MAX_ATTEMPTS || '', 10);
        if (Number.isFinite(configured) && configured > 0) {
            return configured;
        }
        return 3;
    }

    private getServiceErrorMessage(error: any): string {
        const status = error?.response?.status;
        const data = error?.response?.data;
        const requestId =
            error?.response?.headers?.['x-ms-request-id'] ||
            error?.response?.headers?.['apim-request-id'] ||
            error?.response?.headers?.['x-request-id'];

        const serviceMessage =
            data?.error?.message ||
            data?.error?.innererror?.message ||
            data?.message ||
            (typeof data === 'string' ? data : null);

        const parts = [
            status ? `status ${status}` : null,
            serviceMessage,
            requestId ? `requestId ${requestId}` : null,
        ].filter(Boolean);

        return parts.length ? parts.join(' - ') : (error?.message || 'Unknown service error');
    }

    private wrapServiceError(operationName: string, error: any): Error {
        if (!error?.response) {
            return error;
        }

        const wrapped: any = new Error(`${operationName} failed: ${this.getServiceErrorMessage(error)}`);
        wrapped.response = error.response;
        return wrapped;
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private isRetryableStatus(status?: number): boolean {
        if (!status) return false;
        return status === 408 || status === 429 || (status >= 500 && status <= 599);
    }

    private parseHeaderNumber(value: any): number | null {
        if (Array.isArray(value)) {
            value = value[0];
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    private getRetryDelayMs(error: any, attempt: number): number {
        const headers = error?.response?.headers || {};

        const retryAfterMs =
            this.parseHeaderNumber(headers['retry-after-ms']) ??
            this.parseHeaderNumber(headers['x-ms-retry-after-ms']);
        if (retryAfterMs && retryAfterMs > 0) {
            return Math.min(retryAfterMs, 120_000);
        }

        const retryAfterSeconds = this.parseHeaderNumber(headers['retry-after']);
        if (retryAfterSeconds && retryAfterSeconds > 0) {
            return Math.min(retryAfterSeconds * 1000, 120_000);
        }

        const retryAfterDateHeader = headers['retry-after'];
        if (typeof retryAfterDateHeader === 'string') {
            const retryDate = Date.parse(retryAfterDateHeader);
            if (!Number.isNaN(retryDate)) {
                const delta = retryDate - Date.now();
                if (delta > 0) {
                    return Math.min(delta, 120_000);
                }
            }
        }

        const base = Math.min(1000 * (2 ** (attempt - 1)), 30_000);
        const jitter = Math.floor(Math.random() * 500);
        return base + jitter;
    }

    private async withRetry<T>(operationName: string, operation: () => Promise<T>, maxAttempts?: number): Promise<T> {
        const attempts = maxAttempts && maxAttempts > 0 ? maxAttempts : this.getDefaultRetryAttempts();
        let lastError: any = null;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return await operation();
            } catch (error: any) {
                lastError = error;
                const status = error?.response?.status;

                if (!this.isRetryableStatus(status) || attempt >= attempts) {
                    throw this.wrapServiceError(operationName, error);
                }

                const delayMs = this.getRetryDelayMs(error, attempt);
                Logger.Console(
                    `${operationName} throttled (status ${status}). Retrying attempt ${attempt + 1}/${attempts} in ${delayMs}ms`,
                    'warn'
                );
                await this.sleep(delayMs);
            }
        }

        throw lastError;
    }

    // -------------------------------------------------------------------------
    // Embeddings
    // -------------------------------------------------------------------------

    private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
        const cfg = this.embeddingCfg;
        const endpoint = this.normalizeEndpoint(cfg.endpoint);
        const url = `${endpoint}/openai/deployments/${encodeURIComponent(cfg.deployment)}/embeddings?api-version=${encodeURIComponent(cfg.apiVersion)}`;

        const response = await this.withRetry(
            'Azure OpenAI embeddings request',
            async () => this.http.post(url, { input: texts }, {
                headers: {
                    'api-key': cfg.apiKey,
                    'Content-Type': 'application/json',
                }
            }
            )
        );

        const data = response?.data?.data;
        if (!Array.isArray(data)) {
            throw new Error('Invalid embeddings response from Azure OpenAI');
        }

        const sorted = data.slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        return sorted.map(item => item.embedding);
    }

    private async embedTexts(texts: string[]): Promise<number[][]> {
        const expectedDimensions = await this.getEmbeddingDimensions();
        const embeddings = await this.fetchEmbeddings(texts);

        for (const emb of embeddings) {
            if (!Array.isArray(emb) || emb.length !== expectedDimensions) {
                throw new Error(`Embedding dimension mismatch. Expected ${expectedDimensions}, got ${Array.isArray(emb) ? emb.length : 'invalid'}`);
            }
        }

        return embeddings;
    }

    // -------------------------------------------------------------------------
    // Index Management
    // -------------------------------------------------------------------------

    private buildIndexDefinition(indexName: string, dimensions: number) {
        const vectorProfile = 'kb-vector-profile';
        const hnswAlgo = 'kb-hnsw';

        return {
            name: indexName,
            fields: [
                { name: 'chunk_id', type: 'Edm.String', key: true, searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false },
                { name: 'parent_chunk_id', type: 'Edm.String', searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false },
                { name: 'chunk_order', type: 'Edm.Int32', searchable: false, filterable: true, retrievable: true, sortable: true, facetable: false },
                { name: 'document_id', type: 'Edm.String', searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false },
                { name: 'document_name', type: 'Edm.String', searchable: true, filterable: false, retrievable: true, sortable: true, facetable: false },
                { name: 'file_path', type: 'Edm.String', searchable: false, filterable: false, retrievable: true, sortable: false, facetable: false },
                { name: 'total_chunks', type: 'Edm.Int32', searchable: false, filterable: false, retrievable: true, sortable: false, facetable: false },
                { name: 'chunk_size', type: 'Edm.Int32', searchable: false, filterable: false, retrievable: true, sortable: false, facetable: false },
                { name: 'created_at', type: 'Edm.DateTimeOffset', searchable: false, filterable: true, retrievable: true, sortable: true, facetable: false },
                { name: 'user_id', type: 'Edm.String', searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false },
                { name: 'tenant_id', type: 'Edm.String', searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false },
                { name: 'code', type: 'Edm.String', searchable: true, filterable: true, retrievable: true, sortable: false, facetable: false },
                { name: 'code_type', type: 'Edm.String', searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false },
                { name: 'code_description', type: 'Edm.String', searchable: true, filterable: false, retrievable: true, sortable: false, facetable: false },
                { name: 'content', type: 'Edm.String', searchable: true, filterable: false, retrievable: true, sortable: false, facetable: false, analyzer: 'en.microsoft' },
                {
                    name: 'content_vector',
                    type: 'Collection(Edm.Single)',
                    searchable: true,
                    retrievable: false,
                    stored: false,
                    dimensions,
                    vectorSearchProfile: vectorProfile,
                },
            ],
            vectorSearch: {
                algorithms: [
                    {
                        name: hnswAlgo,
                        kind: 'hnsw',
                        hnswParameters: {
                            m: 4,
                            efConstruction: 400,
                            efSearch: 500,
                            metric: 'cosine',
                        },
                    },
                ],
                profiles: [
                    {
                        name: vectorProfile,
                        algorithm: hnswAlgo,
                    },
                ],
            },
        };
    }

    public async ensureCodesIndexExists(): Promise<void> {
        if (this.indexReady) {
            return;
        }

        if (this.indexReadyPromise) {
            return this.indexReadyPromise;
        }

        this.indexReadyPromise = this.ensureCodesIndexExistsInternal()
            .finally(() => {
                this.indexReadyPromise = null;
            });

        return this.indexReadyPromise;
    }

    private async ensureCodesIndexExistsInternal(): Promise<void> {
        const indexName = await this.getIndexName();
        const apiVersion = this.getSearchApiVersion();
        const endpoint = this.normalizeEndpoint(this.searchCfg.endpoint);

        const getUrl = `${endpoint}/indexes('${encodeURIComponent(indexName)}')?api-version=${encodeURIComponent(apiVersion)}`;
        try {
            const resp = await this.withRetry(
                `Azure AI Search get index '${indexName}'`,
                async () => this.http.get(getUrl, { headers: this.headers() }),
                2
            );
            const index = resp?.data;
            const fields = Array.isArray(index?.fields) ? index.fields : [];
            const fieldNames = new Set(fields.map((f: any) => f?.name).filter(Boolean));

            const requiredFields = [
                'chunk_id',
                'document_id',
                'document_name',
                'user_id',
                'tenant_id',
                'code',
                'code_type',
                'code_description',
                'content',
                'content_vector',
            ];
            const missing = requiredFields.filter(f => !fieldNames.has(f));
            if (missing.length) {
                const dimensions = await this.getEmbeddingDimensions();
                const body = this.buildIndexDefinition(indexName, dimensions);
                const putUrl = `${endpoint}/indexes('${encodeURIComponent(indexName)}')?api-version=${encodeURIComponent(apiVersion)}`;

                Logger.Console(`Updating Azure AI Search index schema '${indexName}'. Missing fields: ${missing.join(', ')}`, 'warn');
                await this.withRetry(
                    `Azure AI Search update index '${indexName}'`,
                    async () => this.http.put(putUrl, body, { headers: this.headers() }),
                    1
                );

                this.indexReady = true;
                return;
            }

            const vectorField = fields.find((f: any) => f?.name === 'content_vector');
            const expectedDims = await this.getEmbeddingDimensions();
            if (vectorField?.dimensions && vectorField.dimensions !== expectedDims) {
                throw new Error(`Azure AI Search index '${indexName}' vector dimensions mismatch. Expected ${expectedDims}, got ${vectorField.dimensions}`);
            }

            this.indexReady = true;
            return;
        } catch (e: any) {
            const status = e?.response?.status;
            if (status !== 404) {
                throw e;
            }
        }

        const dimensions = await this.getEmbeddingDimensions();
        const body = this.buildIndexDefinition(indexName, dimensions);
        const putUrl = `${endpoint}/indexes('${encodeURIComponent(indexName)}')?api-version=${encodeURIComponent(apiVersion)}`;

        Logger.Console(`Creating Azure AI Search index: ${indexName}`, 'info');
        // Keep create-index as a single attempt to avoid long throttling loops.
        await this.withRetry(
            `Azure AI Search create index '${indexName}'`,
            async () => this.http.put(putUrl, body, { headers: this.headers() }),
            1
        );
        Logger.Console(`Azure AI Search index ensured: ${indexName}`, 'info');
        this.indexReady = true;
    }

    // -------------------------------------------------------------------------
    // Public Document Operations
    // -------------------------------------------------------------------------

    public async embedAndIndex(params: {
        recordId: string;
        title: string;
        contentChunks: IKnowledgeBaseContentChunk[];
        filePath?: string | null;
        userId: string;
        tenantId: string;
    }): Promise<{ documentId: string; totalChunks: number; }> {
        await this.ensureCodesIndexExists();

        const indexName = await this.getIndexName();
        const apiVersion = this.getSearchApiVersion();
        const endpoint = this.normalizeEndpoint(this.searchCfg.endpoint);
        const url = `${endpoint}/indexes('${encodeURIComponent(indexName)}')/docs/search.index?api-version=${encodeURIComponent(apiVersion)}`;

        const documentId = params.recordId;
        const createdAt = new Date().toISOString();

        const contentChunks = (params.contentChunks || [])
            .map(chunk => KnowledgeBaseUtils.normalizeChunk(chunk))
            .filter(chunk => KnowledgeBaseUtils.chunkToText(chunk).length > 0);

        if (!contentChunks.length) {
            throw new Error('No chunkable content found for indexing');
        }

        const totalChunks = contentChunks.length;

        const batchSize = 16;
        const actions: IndexDocumentAction[] = [];

        for (let i = 0; i < contentChunks.length; i += batchSize) {
            const batch = contentChunks.slice(i, i + batchSize);
            const batchTexts = batch.map(chunk => KnowledgeBaseUtils.chunkToText(chunk));
            const embeddings = await this.embedTexts(batchTexts);

            batch.forEach((chunkObj, offset) => {
                const chunkOrder = i + offset;
                const chunkId = `${documentId}-${chunkOrder}`;
                const embedding = embeddings[offset];
                const chunkText = KnowledgeBaseUtils.chunkToText(chunkObj);
                actions.push({
                    "@search.action": "upload",
                    chunk_id: chunkId,
                    parent_chunk_id: documentId,
                    chunk_order: chunkOrder,
                    document_id: documentId,
                    document_name: params.title,
                    file_path: params.filePath || null,
                    total_chunks: totalChunks,
                    chunk_size: KnowledgeBaseUtils.calculateTokenCount(chunkText),
                    created_at: createdAt,
                    user_id: params.userId,
                    tenant_id: params.tenantId,
                    code: chunkObj.code || null,
                    code_type: this.normalizeCodeType(chunkObj.type),
                    code_description: chunkObj.description || null,
                    content: chunkText,
                    content_vector: embedding,
                });
            });
        }

        // Upload in batches to stay under service limits.
        const indexBatchSize = 250;
        for (let i = 0; i < actions.length; i += indexBatchSize) {
            const part = actions.slice(i, i + indexBatchSize);
            const resp = await this.withRetry(
                'Azure AI Search index upload batch',
                async () => this.http.post(url, { value: part }, { headers: this.headers() })
            );
            const results = resp?.data?.value;
            if (Array.isArray(results)) {
                const failed = results.filter(r => r?.status === false);
                if (failed.length) {
                    const msg = failed[0]?.errorMessage || 'Unknown indexing failure';
                    throw new Error(`Azure AI Search indexing failed: ${msg}`);
                }
            }
        }

        return { documentId, totalChunks };
    }

    public async retrieveDocuments(query: string, userId: string, tenantId: string, k: number = 8, filterQuery?: KnowledgeBaseFilterQuery): Promise<IKnowledgeBaseSearchResult> {
        await this.ensureCodesIndexExists();

        const indexName = await this.getIndexName();
        const apiVersion = this.getSearchApiVersion();
        const endpoint = this.normalizeEndpoint(this.searchCfg.endpoint);
        const url = `${endpoint}/indexes('${encodeURIComponent(indexName)}')/docs/search.post.search?api-version=${encodeURIComponent(apiVersion)}`;

        const [queryVector] = await this.embedTexts([query]);

        const filter = this.buildFilterExpression(userId, tenantId, filterQuery);
        const select = [
            'chunk_id',
            'parent_chunk_id',
            'chunk_order',
            'document_id',
            'document_name',
            'file_path',
            'total_chunks',
            'chunk_size',
            'created_at',
            'user_id',
            'tenant_id',
            'code',
            'code_type',
            'code_description',
            'content',
        ].join(',');

        const body = {
            search: query || '*',
            top: k,
            filter,
            select,
            vectorQueries: [
                {
                    kind: 'vector',
                    vector: queryVector,
                    fields: 'content_vector',
                    k,
                }
            ],
            vectorFilterMode: 'preFilter',
        };

        const resp = await this.withRetry(
            'Azure AI Search retrieve documents',
            async () => this.http.post(url, body, { headers: this.headers() })
        );
        const value = resp?.data?.value;
        const matches: IKnowledgeBaseVectorChunk[] = Array.isArray(value) ? value.map((row: any) => ({
            chunkId: row.chunk_id,
            parentChunkId: row.parent_chunk_id ?? null,
            chunkOrder: row.chunk_order ?? 0,
            documentId: row.document_id,
            documentName: row.document_name,
            filePath: row.file_path ?? null,
            totalChunks: row.total_chunks ?? 0,
            chunkSize: row.chunk_size ?? 0,
            createdAt: row.created_at,
            userId: row.user_id,
            tenantId: row.tenant_id,
            code: row.code ?? null,
            codeType: row.code_type ?? null,
            codeDescription: row.code_description ?? null,
            content: row.content || '',
            score: row['@search.score'],
        })) : [];

        return { matches };
    }

    public async retrieveCodeCandidates(query: string, userId: string, tenantId: string, codeType: 'wc_code' | 'cost_code', topK = 3): Promise<IKnowledgeBaseVectorChunk[]> {
        await this.ensureCodesIndexExists();

        const indexName = await this.getIndexName();
        const apiVersion = this.getSearchApiVersion();
        const endpoint = this.normalizeEndpoint(this.searchCfg.endpoint);
        const url = `${endpoint}/indexes('${encodeURIComponent(indexName)}')/docs/search.post.search?api-version=${encodeURIComponent(apiVersion)}`;

        const [queryVector] = await this.embedTexts([query]);

        const filter = [
            `user_id eq '${this.escapeODataString(userId)}'`,
            `tenant_id eq '${this.escapeODataString(tenantId)}'`,
            `code_type eq '${codeType}'`,
        ].join(' and ');

        const body = {
            search: query,
            searchFields: 'code_description',
            top: topK,
            filter,
            select: 'code,code_type,code_description',
            vectorQueries: [
                {
                    kind: 'vector',
                    vector: queryVector,
                    fields: 'content_vector',
                    k: topK,
                }
            ],
            vectorFilterMode: 'preFilter',
        };

        const resp = await this.withRetry(
            'Azure AI Search retrieve code candidates',
            async () => this.http.post(url, body, { headers: this.headers() })
        );

        const rows: any[] = resp?.data?.value ?? [];
        return rows.map(row => ({
            chunkId: row.chunk_id ?? '',
            parentChunkId: null,
            chunkOrder: 0,
            documentId: row.document_id ?? '',
            documentName: row.document_name ?? '',
            filePath: null,
            totalChunks: 0,
            chunkSize: 0,
            createdAt: '',
            userId,
            tenantId,
            code: row.code ?? null,
            codeType: row.code_type ?? null,
            codeDescription: row.code_description ?? null,
            content: '',
            score: row['@search.score'],
        }));
    }

    public async getChunksByDocumentId(documentId: string, userId: string, tenantId: string): Promise<IKnowledgeBaseVectorChunk[]> {
        await this.ensureCodesIndexExists();

        const indexName = await this.getIndexName();
        const apiVersion = this.getSearchApiVersion();
        const endpoint = this.normalizeEndpoint(this.searchCfg.endpoint);
        const url = `${endpoint}/indexes('${encodeURIComponent(indexName)}')/docs/search.post.search?api-version=${encodeURIComponent(apiVersion)}`;

        const filter = `document_id eq '${this.escapeODataString(documentId)}' and user_id eq '${this.escapeODataString(userId)}' and tenant_id eq '${this.escapeODataString(tenantId)}'`;
        const select = [
            'chunk_id',
            'parent_chunk_id',
            'chunk_order',
            'document_id',
            'document_name',
            'file_path',
            'total_chunks',
            'chunk_size',
            'created_at',
            'user_id',
            'tenant_id',
            'code',
            'code_type',
            'code_description',
            'content',
        ].join(',');

        const chunks: IKnowledgeBaseVectorChunk[] = [];
        const pageSize = 1000;
        let skip = 0;

        while (true) {
            const body = {
                search: '*',
                top: pageSize,
                skip,
                filter,
                orderby: 'chunk_order asc',
                select,
            };
            const resp = await this.withRetry(
                'Azure AI Search get chunks by document',
                async () => this.http.post(url, body, { headers: this.headers() })
            );
            const value = resp?.data?.value;
            const page: IKnowledgeBaseVectorChunk[] = Array.isArray(value) ? value.map((row: any) => ({
                chunkId: row.chunk_id,
                parentChunkId: row.parent_chunk_id ?? null,
                chunkOrder: row.chunk_order ?? 0,
                documentId: row.document_id,
                documentName: row.document_name,
                filePath: row.file_path ?? null,
                totalChunks: row.total_chunks ?? 0,
                chunkSize: row.chunk_size ?? 0,
                createdAt: row.created_at,
                userId: row.user_id,
                tenantId: row.tenant_id,
                code: row.code ?? null,
                codeType: row.code_type ?? null,
                content: row.content || '',
                score: row['@search.score'],
            })) : [];

            chunks.push(...page);
            if (page.length < pageSize) break;
            skip += pageSize;
        }

        return chunks;
    }

    public async deleteDocumentsByDocumentId(documentId: string, userId: string, tenantId: string): Promise<{ deleted: number }> {
        await this.ensureCodesIndexExists();

        const indexName = await this.getIndexName();
        const apiVersion = this.getSearchApiVersion();
        const endpoint = this.normalizeEndpoint(this.searchCfg.endpoint);

        const searchUrl = `${endpoint}/indexes('${encodeURIComponent(indexName)}')/docs/search.post.search?api-version=${encodeURIComponent(apiVersion)}`;
        const indexUrl = `${endpoint}/indexes('${encodeURIComponent(indexName)}')/docs/search.index?api-version=${encodeURIComponent(apiVersion)}`;

        const filter = `document_id eq '${this.escapeODataString(documentId)}' and user_id eq '${this.escapeODataString(userId)}' and tenant_id eq '${this.escapeODataString(tenantId)}'`;

        const pageSize = 1000;
        let skip = 0;
        const chunkIds: string[] = [];

        while (true) {
            const body = {
                search: '*',
                top: pageSize,
                skip,
                filter,
                select: 'chunk_id',
            };
            const resp = await this.withRetry(
                'Azure AI Search list chunk ids for delete',
                async () => this.http.post(searchUrl, body, { headers: this.headers() })
            );
            const value = resp?.data?.value;
            const page = Array.isArray(value) ? value.map((row: any) => row.chunk_id).filter(Boolean) : [];
            chunkIds.push(...page);
            if (page.length < pageSize) break;
            skip += pageSize;
        }

        if (!chunkIds.length) return { deleted: 0 };

        const deleteBatchSize = 500;
        for (let i = 0; i < chunkIds.length; i += deleteBatchSize) {
            const part = chunkIds.slice(i, i + deleteBatchSize);
            const actions: IndexDocumentAction[] = part.map(chunkId => ({
                "@search.action": "delete",
                chunk_id: chunkId,
            }));

            const resp = await this.withRetry(
                'Azure AI Search delete chunk batch',
                async () => this.http.post(indexUrl, { value: actions }, { headers: this.headers() })
            );
            const results = resp?.data?.value;
            if (Array.isArray(results)) {
                const failed = results.filter(r => r?.status === false);
                if (failed.length) {
                    const msg = failed[0]?.errorMessage || 'Unknown delete failure';
                    throw new Error(`Azure AI Search delete failed: ${msg}`);
                }
            }
        }

        return { deleted: chunkIds.length };
    }

    public async ask(question: string, userId: string, tenantId: string, k: number = 8, filterQuery?: KnowledgeBaseFilterQuery): Promise<IKnowledgeBaseAskResponse> {
        const retrieved = await this.retrieveDocuments(question, userId, tenantId, k, filterQuery);
        if (!retrieved.matches.length) {
            return {
                finalAnswer: "I don't know based on your knowledge base.",
                citations: [],
                note: 'No relevant knowledge base chunks were found.',
            };
        }

        const topMatches = retrieved.matches.slice(0, k);
        const context = topMatches.map((m, i) => {
            const clipped = KnowledgeBaseUtils.normalizeText(m.content).slice(0, 2000);
            return `SOURCE ${i + 1}\n` +
                `title: ${m.documentName}\n` +
                `document_id: ${m.documentId}\n` +
                `chunk_id: ${m.chunkId}\n` +
                `chunk_order: ${m.chunkOrder}/${m.totalChunks}\n` +
                `content:\n${clipped}\n`;
        }).join('\n---\n');

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", `
You answer questions using a user's private knowledge base.

Rules:
- Use ONLY the provided sources. Do not use outside knowledge.
- If the sources do not contain the answer, say you don't know based on the knowledge base.
- Do not fabricate citations or facts.
- Keep the answer concise and directly responsive.
            `.trim()],
            ["human", `Question:\n{question}\n\nSources:\n{context}\n\nAnswer:`],
        ]);

        const model = LLMClientFactory.getLLMClient().getQALLMInstance(0.2);
        const chain = prompt.pipe(model);
        const result: any = await chain.invoke({ question, context });

        const finalAnswer = typeof result?.content === 'string'
            ? result.content.trim()
            : (typeof result === 'string' ? result.trim() : JSON.stringify(result));

        const citations: IKnowledgeBaseAskCitation[] = topMatches.map(m => ({
            documentId: m.documentId,
            chunkId: m.chunkId,
            chunkOrder: m.chunkOrder,
            title: m.documentName,
            snippet: KnowledgeBaseUtils.buildSnippet(m.content, 280),
            score: m.score,
        }));

        const note = `Answer grounded in ${topMatches.length} retrieved chunk(s).`;

        return { finalAnswer, citations, note };
    }
}


export default AzureAISearch;