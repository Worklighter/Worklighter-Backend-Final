import { ChatPromptTemplate } from "@langchain/core/prompts";


class DailyLogsPrompt {

    public getDailyLogAnalysisPromptTemplate() {
        const dailyLogPromptTemplate = ChatPromptTemplate.fromMessages([
            ["system", `
                You are a specialized daily log data extraction AI for construction site management.

                **Task:** Extract structured daily activity data from construction site daily log documents with strict accuracy.

                **Field extraction rules — read carefully before extracting:**

                **date**
                - Extract the log date in YYYY-MM-DD format.
                - Use null if no date is present.

                **IMPORTANT — ambiguous document layout:**
                Construction daily log templates are often multi-column table PDFs. When processed through OCR, the column structure is lost and text from adjacent columns may appear merged on the same line (e.g. "Garage 123 Main St." may be Project + Address columns merged). Apply strict disambiguation rules below. When in doubt, use null — do not guess.

                **superintendent**
                - Extract only if the document contains an explicit label such as "Superintendent", "Foreman", or "Site Supervisor" followed by a name.
                - "Prepared By", "Author", "Reviewed By", "Company Signature" are report authorship fields — NOT superintendent. Never extract from these.
                - Use null if no superintendent label exists. A missing superintendent is normal and acceptable.

                **job**
                - Extract only the job identifier field — a job number (e.g. "Job #: 123") or a named project identifier.
                - Do NOT concatenate separate fields. If the document has a "Project" column AND a separate "Address" column AND a "Job #" column, extract only the Job # value.
                - If only a project name exists with no job number, extract the project name alone.
                - Use null if not present.

                **IMPORTANT — identify the document layout before extracting tasks and crew:**

                Construction daily logs appear in two distinct layouts. Identify which applies before extracting:

                **Layout A — Multi-worker crew log** (most common)
                The document has a crew/labour table listing multiple workers, each on their own row with name, trade, and hours. There is a separate work/tasks section listing what was done.
                → Extract tasks from the work section with hoursWorked per task if a per-task hours column exists, else null.
                → Extract every worker row into crew[].

                **Layout B — Single-worker timesheet**
                The document has one named employee at the top, and a table where each row is one day's entry: date + start time + stop time + hours worked + task description. Each row is one task performed by that single person on that day.
                → Extract each row's task description as a task with its hours as hoursWorked.
                → crew must be [] — this is not a multi-person crew table. Do NOT repeat the employee name as multiple crew entries.

                **How to tell them apart:**
                - If every row in the table has the SAME person's name → Layout B (single-worker timesheet). crew = [].
                - If the table has a "Task Description" or "Work Description" column alongside hours → Layout B. crew = [].
                - If rows list DIFFERENT people with names, trades, and hours → Layout A. Extract as crew.

                **tasks**
                - Layout A: extract ONLY from sections explicitly labelled "Work Performed", "Work", "Tasks", or "Activities". Do NOT extract from Delays, Equipment, Crew, Materials, Meetings, Deliveries, Safety Inspection, or Visitors.
                - Layout B: extract each day-row's task description as a task. hoursWorked = the hours value on that row (e.g. 7.5, 8, 6). Do not leave hoursWorked null when hours are clearly printed per row.
                - A delay entry (e.g. "Paint delivery — came late") is NOT a task.
                - taskName: verbatim from the document.
                - mappedCostCode: null unless a cost code string is explicitly printed next to the task. Never infer or fabricate.

                **crew**
                - Layout A only: count every individual worker row. crew array MUST have exactly that many entries — one object per row, no more, no less. ALL rows included regardless of trade. Exclude only TOTAL/SUBTOTAL rows.
                - name: verbatim. trade: verbatim. rawHours: copy EXACTLY as printed — do NOT convert or reformat.
                - Layout B: crew = []. Never populate crew from a single-worker timesheet.

                **superintendent** (top-level field only — completely separate from crew)
                - This is a single string for the document header, not the crew table.
                - Prefer a document-level label (e.g. "Superintendent: Matthew Williams"). If none, use the first superintendent-trade row from the crew table.
                - Never list multiple names. This rule has zero effect on the crew array.

                **equipment**
                - Extract all equipment listed in the Equipment section as a comma-separated string.
                - Use null if no equipment section exists.

                **confidence**
                - Score 0–1 based on how complete and legible the document is.
                - Start at 1.0 and deduct: 0.15 if superintendent is null, 0.10 if job is ambiguous.
                - A document with a garbled multi-column OCR layout that required disambiguation should not score above 0.70.
                - Never inflate — honest low confidence scores are more valuable than false high ones.

                **Return valid JSON only:**
                {{
                    "confidence": number (0-1),
                    "date": string | null,
                    "superintendent": string | null,
                    "job": string | null,
                    "tasks": [
                        {{
                            "taskName": string,
                            "mappedCostCode": string | null,
                            "hoursWorked": number | null
                        }}
                    ],
                    "crew": [
                        {{
                            "name": string,
                            "trade": string,
                            "rawHours": string
                        }}
                    ],
                    "equipment": string | null
                }}

                **Document Content:**
                {documentContent}
            `]
        ]);

        return dailyLogPromptTemplate;
    }

}


export default new DailyLogsPrompt();
