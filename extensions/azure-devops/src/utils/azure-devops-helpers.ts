import {Color, Icon} from "@raycast/api";
import {WorkItemsResponse, WiqlResponse} from "../types/azure-devops"

const API_BASE_URL = "https://dev.azure.com"

export const STATE_COLORS: Record<string, Color> = {
    Active: Color.Blue,
    New: Color.Purple,
    "In Progress": Color.Orange,
    Resolved: Color.Green,
    Done: Color.Green,
    "To Do": Color.Yellow,
    Closed: Color.SecondaryText,
};

function sanitizeWiqlInput(text: string): string {
    return text.trim().replace(/'/g, "''").replace(/[;\-\-]/g, "");
}

async function executeWiql(org: string, pat: string, query: string, maxResults = 50): Promise<WiqlResponse> {
    const url = buildUrl(`${org}/_apis/wit/wiql`, {"$top": maxResults});

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: buildAuthHeader(pat),
        },
        body: JSON.stringify({query}),
    });

    if (!res.ok) {
        throw new Error(`WIQL: ${res.status} ${res.statusText}`);
    }

    return await res.json() as WiqlResponse;
}

export async function fetchQueryWiql(org: string, pat: string, text: string, maxResults = 50): Promise<WiqlResponse> {
    const trimmed = text.trim();
    let query: string;

    if (/^\d+$/.test(trimmed)) {
        query = `Select [System.Id]
                 From WorkItems
                 Where [System.Id] = ${parseInt(trimmed, 10)}
                 Order By [System.ChangedDate] Desc`;
    } else {
        const safe = sanitizeWiqlInput(trimmed);
        query = `Select [System.Id]
                 From WorkItems
                 Where [System.Title] Contains '${safe}'
                 Order By [System.ChangedDate] Desc`;
    }

    return executeWiql(org, pat, query, maxResults);
}

export async function fetchMyWorkItems(org: string, pat: string): Promise<WiqlResponse> {
    return executeWiql(
        org,
        pat,
        `Select [System.Id]
         From WorkItems
         Where [System.AssignedTo] = @Me
         And [System.State] <> 'Closed'
         And [System.State] <> 'Removed'
         Order By [System.ChangedDate] Desc`,
        100
    );
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

export async function testConnection(org: string, pat: string): Promise<void> {
    const url = buildUrl(`${org}/_apis/wit/wiql`, {"$top": 1});

    const res = await fetch(url, {
        method: "POST",
        redirect: "manual",
        headers: {
            "Content-Type": "application/json",
            Authorization: buildAuthHeader(pat),
        },
        body: JSON.stringify({query: "Select [System.Id] From WorkItems Where [System.Id] = 0"}),
    });

    if (res.status === 301 || res.status === 302 || res.status === 303) {
        throw new Error("Authentication failed");
    }
    if (res.status === 401 || res.status === 403) {
        throw new Error("Authentication failed");
    }
    if (res.status === 404) {
        throw new Error(`Organization "${org}" not found`);
    }
    if (!res.ok) {
        throw new Error("Authentication failed");
    }
}

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

function buildUrl(path: string, params?: Record<string, unknown>): string {

    const url = new URL(path, API_BASE_URL);

    const sp = url.searchParams;

    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null) {
                return;
            }

            if (Array.isArray(value)) {
                value.forEach((v) => sp.append(key, String(v)));
                return;
            }

            sp.set(key, String(value));
        });
    }

    sp.set("api-version", "7.1")

    return url.toString();
}

function buildAuthHeader(pat: string): string {
    return "Basic " + Buffer.from(":" + pat).toString("base64");
}
