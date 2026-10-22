import axios, { AxiosInstance } from "axios";
import { Application } from "../../app";
import { Logger } from "../../utils/helpers/logger";

interface JobSearchDoc {
    job_id: string;
    job_name: string;
    job_number: string;
    tenant_id: string;
    content: string;
    content_vector: number[];
}

export interface JobSearchMatch {
    jobId: string;
    jobName: string;
    jobNumber: string;
    score: number;
}

type IndexAction = Record<string, any> & { "@search.action": "upload" | "delete" };

class AzureJobsSearch {

    private static instance: AzureJobsSearch;
    private http: AxiosInstance;
    private indexReady: boolean = false;
    private indexReadyPromise: Promise<void> | null = null;
    private actualEmbeddingDimensions: number | null = null;

    private constructor() {
        this.http = axios.create({ timeout: 60000 });
    }

    public static getInstance(): AzureJobsSearch {
        if (!AzureJobsSearch.instance) {
            AzureJobsSearch.instance = new AzureJobsSearch();
        }
        return AzureJobsSearch.instance;
    }

    // -------------------------------------------------------------------------
    // Config
    // -------------------------------------------------------------------------

    private get searchCfg() {
        const cfg = Application?.conf?.SERVICES?.AZURE?.AI_SEARCH_SERVICE;
        if (!cfg?.endpoint || !cfg?.apiKey || !cfg?.jobsIndexName) {
            throw new Error('Azure Jobs Search is not configured (required: AZURE_AI_SEARCH_ENDPOINT, AZURE_AI_SEARCH_API_KEY, AZURE_AI_SEARCH_JOBS_INDEX_NAME)');
        }
        return cfg;
    }

    private get embeddingCfg() {
        const cfg = Application?.conf?.SERVICES?.AZURE?.OPENAI_EMBEDDINGS;
        if (!cfg?.endpoint || !cfg?.apiKey || !cfg?.deployment) {
            throw new Error('Azure OpenAI embeddings are not configured');
        }
        return cfg;
    }

    private get indexName(): string {
        return (this.searchCfg.jobsIndexName || '').trim().replace(/_+/g, '-').toLowerCase();
    }

    private get apiVersion(): string {
        return this.searchCfg.apiVersion || '2024-07-01';
    }

    private get endpoint(): string {
        return this.searchCfg.endpoint.replace(/\/+$/, '');
    }

    private headers() {
        return {
            'api-key': this.searchCfg.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json;odata.metadata=none',
        };
    }

    private escapeOData(value: string) {
        return (value || '').replace(/'/g, "''");
    }

    // -------------------------------------------------------------------------
    // Embeddings
    // -------------------------------------------------------------------------

    private async getEmbeddingDimensions(): Promise<number> {
        if (this.actualEmbeddingDimensions) return this.actualEmbeddingDimensions;
        const embeddings = await this.fetchEmbeddings(['probe']);
        this.actualEmbeddingDimensions = embeddings[0].length;
        return this.actualEmbeddingDimensions;
    }

    private async fetchEmbeddings(texts: string[]): Promise<number[][]> {
        const cfg = this.embeddingCfg;
        const url = `${cfg.endpoint.replace(/\/+$/, '')}/openai/deployments/${encodeURIComponent(cfg.deployment)}/embeddings?api-version=${encodeURIComponent(cfg.apiVersion)}`;
        const response = await this.http.post(url, { input: texts }, {
            headers: { 'api-key': cfg.apiKey, 'Content-Type': 'application/json' }
        });
        const data = response?.data?.data;
        if (!Array.isArray(data)) throw new Error('Invalid embeddings response');
        return data.slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((item: any) => item.embedding);
    }

    // -------------------------------------------------------------------------
    // Index management
    // -------------------------------------------------------------------------

    private buildIndexDefinition(dimensions: number) {
        const vectorProfile = 'jobs-vector-profile';
        const hnswAlgo = 'jobs-hnsw';
        return {
            name: this.indexName,
            fields: [
                { name: 'job_id', type: 'Edm.String', key: true, searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false },
                { name: 'job_name', type: 'Edm.String', searchable: true, filterable: false, retrievable: true, sortable: false, facetable: false, analyzer: 'en.microsoft' },
                { name: 'job_number', type: 'Edm.String', searchable: true, filterable: false, retrievable: true, sortable: false, facetable: false },
                { name: 'tenant_id', type: 'Edm.String', searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false },
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
                algorithms: [{ name: hnswAlgo, kind: 'hnsw', hnswParameters: { m: 4, efConstruction: 400, efSearch: 500, metric: 'cosine' } }],
                profiles: [{ name: vectorProfile, algorithm: hnswAlgo }],
            },
        };
    }

    public async ensureIndexExists(): Promise<void> {
        if (this.indexReady) return;
        if (this.indexReadyPromise) return this.indexReadyPromise;

        this.indexReadyPromise = this._ensureIndex().finally(() => { this.indexReadyPromise = null; });
        return this.indexReadyPromise;
    }

    private async _ensureIndex(): Promise<void> {
        const getUrl = `${this.endpoint}/indexes('${encodeURIComponent(this.indexName)}')?api-version=${encodeURIComponent(this.apiVersion)}`;
        try {
            await this.http.get(getUrl, { headers: this.headers() });
            this.indexReady = true;
            return;
        } catch (e: any) {
            if (e?.response?.status !== 404) throw e;
        }

        const dimensions = await this.getEmbeddingDimensions();
        const putUrl = `${this.endpoint}/indexes('${encodeURIComponent(this.indexName)}')?api-version=${encodeURIComponent(this.apiVersion)}`;
        Logger.Console(`Creating Azure AI Search jobs index: ${this.indexName}`, 'info');
        await this.http.put(putUrl, this.buildIndexDefinition(dimensions), { headers: this.headers() });
        Logger.Console(`Azure AI Search jobs index ready: ${this.indexName}`, 'info');
        this.indexReady = true;
    }

    // -------------------------------------------------------------------------
    // Public operations
    // -------------------------------------------------------------------------

    public async indexJob(jobId: string, jobName: string, jobNumber: string | null, tenantId: string): Promise<void> {
        await this.ensureIndexExists();

        const content = jobNumber
            ? `Job: ${jobName} | Job Number: ${jobNumber}`
            : `Job: ${jobName}`;
        const [vector] = await this.fetchEmbeddings([content]);

        const action: IndexAction = {
            '@search.action': 'upload',
            job_id: jobId,
            job_name: jobName,
            job_number: jobNumber ?? '',
            tenant_id: tenantId,
            content,
            content_vector: vector,
        };

        const url = `${this.endpoint}/indexes('${encodeURIComponent(this.indexName)}')/docs/search.index?api-version=${encodeURIComponent(this.apiVersion)}`;
        await this.http.post(url, { value: [action] }, { headers: this.headers() });
        Logger.Console(`Indexed job ${jobId} (${jobName}) in Azure AI Search`, 'info');
    }

    public async deleteJob(jobId: string): Promise<void> {
        if (!this.indexReady) return;

        const action: IndexAction = { '@search.action': 'delete', job_id: jobId };
        const url = `${this.endpoint}/indexes('${encodeURIComponent(this.indexName)}')/docs/search.index?api-version=${encodeURIComponent(this.apiVersion)}`;
        try {
            await this.http.post(url, { value: [action] }, { headers: this.headers() });
            Logger.Console(`Deleted job ${jobId} from Azure AI Search jobs index`, 'info');
        } catch (error: any) {
            Logger.Console(`Failed to delete job ${jobId} from jobs index: ${error?.message}`, 'warn');
        }
    }

    public async findMatchingJob(query: string, tenantId: string, topK = 1): Promise<JobSearchMatch[]> {
        await this.ensureIndexExists();

        const [vector] = await this.fetchEmbeddings([query]);
        const filter = `tenant_id eq '${this.escapeOData(tenantId)}'`;

        const url = `${this.endpoint}/indexes('${encodeURIComponent(this.indexName)}')/docs/search.post.search?api-version=${encodeURIComponent(this.apiVersion)}`;

        const body = {
            search: query,
            filter,
            top: topK,
            select: 'job_id,job_name,job_number',
            vectorQueries: [
                {
                    kind: 'vector',
                    vector,
                    fields: 'content_vector',
                    k: topK,
                    exhaustive: false,
                },
            ],
        };

        const response = await this.http.post(url, body, { headers: this.headers() });
        const results: any[] = response?.data?.value ?? [];

        return results.map(r => ({
            jobId: r.job_id,
            jobName: r.job_name,
            jobNumber: r.job_number,
            score: r['@search.score'] ?? 0,
        }));
    }

    /**
     * Dedicated single-match job retrieval. Searches job_name and job_number with keyword
     * and content_vector with a vector query. Returns the top match or null.
     *
     * Query to pass: the AI-extracted job hint from the analysis report (extractedData.job).
     * e.g. "Site Prep Phase 1" or "JOB-2024-0042"
     */
    public async retrieveJobCandidates(query: string, tenantId: string, topK = 3): Promise<JobSearchMatch[]> {
        await this.ensureIndexExists();

        const [vector] = await this.fetchEmbeddings([query]);
        const filter = `tenant_id eq '${this.escapeOData(tenantId)}'`;

        const url = `${this.endpoint}/indexes('${encodeURIComponent(this.indexName)}')/docs/search.post.search?api-version=${encodeURIComponent(this.apiVersion)}`;

        const body = {
            search: query,
            searchFields: 'job_name,job_number',
            filter,
            top: topK,
            select: 'job_id,job_name,job_number',
            vectorQueries: [
                {
                    kind: 'vector',
                    vector,
                    fields: 'content_vector',
                    k: topK,
                    exhaustive: false,
                },
            ],
        };

        const response = await this.http.post(url, body, { headers: this.headers() });
        const results: any[] = response?.data?.value ?? [];

        return results.map(r => ({
            jobId: r.job_id,
            jobName: r.job_name,
            jobNumber: r.job_number,
            score: r['@search.score'] ?? 0,
        }));
    }
}

export default AzureJobsSearch;
