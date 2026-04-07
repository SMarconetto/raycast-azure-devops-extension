import {Color, Icon} from "@raycast/api";
import {WorkItemsResponse, WiqlResponse} from "../types/azure-devops"

// ─── Constants ────────────────────────────────────────────────────────────────

export const API_BASE_URL = "https://dev.azure.com"

export const STATE_COLORS: Record<string, Color> = {
    Active: Color.Blue,
    New: Color.Purple,
    "In Progress": Color.Orange,
    Resolved: Color.Green,
    Done: Color.Green,
    "To Do": Color.Yellow,
    Closed: Color.SecondaryText,
};


// ─── API ─────────────────────────────────────────────────────────────────


export async function fetchQueryWiql(org: string, pat: string, text: string, maxResults = 50): Promise<WiqlResponse> {

    let wiqlQuery = "";

    // execute search by work item id
    const isId = /^\d+$/.test(text.trim());
    if (isId) {
        wiqlQuery = `Select [System.Id]
                     From WorkItems
                     Where [System.Id] = ${text.trim()}
                     Order By [System.ChangedDate] Desc`;
    } else {

        // execute search by work item title as fallback
        const safe = text.trim().replace(/'/g, "''"); // escape singolo apice
        wiqlQuery = `Select [System.Id]
                     From WorkItems
                     Where [System.Title] Contains '${safe}'
                     Order By [System.ChangedDate] Desc`;
    }


    const url = buildUrl(`${org}/_apis/wit/wiql`,
        {
            "$top": maxResults,
        })

    const res = await fetch(url,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: buildAuthHeader(pat),
            },
            body: JSON.stringify({query: wiqlQuery}),
        }
    );

    if (!res.ok) {
        throw new Error(`Fetch WIQL: ${res.status} ${res.statusText}`);
    }

    return await res.json() as WiqlResponse;
}

export async function fetchWorkItemsByIds(org: string, pat: string, ids: number[]): Promise<WorkItemsResponse> {

    if (ids.length === 0) {
        return {value: []};
    }

    const url = buildUrl(`${org}/_apis/wit/workitemsbatch`);

    const res = await fetch(url,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: buildAuthHeader(pat),
            },
            body: JSON.stringify(
                {
                    ids: ids,
                    fields: [
                        "System.id",
                        "System.Title",
                        "System.State",
                        "System.WorkItemType",
                        "System.AssignedTo",
                        "System.CreatedDate",
                        "System.ChangedDate"
                    ]
                }
            )
        }
    );

    if (!res.ok) {
        throw new Error(`Fetch work items: ${res.status} ${res.statusText}`);
    }

    return await res.json() as WorkItemsResponse;
}

// ─── Methods ─────────────────────────────────────────────────────────────────

export function buildWorkItemUrl(
    org: string,
    id: number
): string {
    return `${API_BASE_URL}/${org}/_workitems/edit/${id}`
}

export function getWorkItemIcon(type: string): Icon {
    switch (type) {
        case "Bug":
            return Icon.Bug;
        case "Task":
            return Icon.Checkmark;
        case "Epic":
            return Icon.Star;
        case "Feature":
            return Icon.AppWindowList;
        case "User Story":
            return Icon.Person;
        default:
            return Icon.Document;
    }
}


// ─── Helpers ─────────────────────────────────────────────────────────────────


function buildUrl(path: string, params?: Record<string, unknown>): string {

    const url = new URL(path, API_BASE_URL);

    const sp = url.searchParams;

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null) {
                return;
            }

            // array
            if (Array.isArray(value)) {
                value.forEach((v) => sp.append(key, String(v)));
                return;
            }

            // number, boolean, string
            sp.set(key, String(value));
        });
    }

    sp.set("api-version", "7.1")

    return url.toString();
}


function buildAuthHeader(pat: string): string {
    return "Basic " + Buffer.from(":" + pat).toString("base64");
}
