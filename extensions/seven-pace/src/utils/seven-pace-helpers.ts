import {Color, Icon} from "@raycast/api";
import {SevenPaceActivityType, SevenPaceWorkItem, SevenPaceWorkLog} from "../types/seven-pace";

export const STATE_COLORS: Record<string, Color> = {
    Active: Color.Blue,
    New: Color.Purple,
    "In Progress": Color.Orange,
    Resolved: Color.Green,
    Done: Color.Green,
    "To Do": Color.Yellow,
    Closed: Color.SecondaryText,
};

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

export async function fetchActivityTypes(apiUrl: string, token: string): Promise<SevenPaceActivityType[]> {
    const parsed = new URL(apiUrl.trim().replace(/\/+$/, ""));
    const url = new URL(`${parsed.origin}/api/rest/activityTypes`);
    url.searchParams.set("api-version", "3.2");

    const res = await fetch(url.toString(), {
        headers: {Authorization: `Bearer ${token}`},
    });

    if (!res.ok) {
        throw new Error(`7pace activityTypes: ${res.status} ${await res.text()}`);
    }

    const json = await res.json() as { data: { enabled: boolean; activityTypes: SevenPaceActivityType[] } };
    if (!json.data?.enabled) return [];
    return json.data.activityTypes ?? [];
}

export function buildWorkLogsUrl(apiUrl: string): URL {
    const parsed = new URL(apiUrl.trim().replace(/\/+$/, ""));
    const url = new URL(`${parsed.origin}/api/rest/workLogs`);
    url.searchParams.set("api-version", parsed.searchParams.get("api-version") ?? "3.2");
    return url;
}

function buildODataWorkItemsUrl(apiUrl: string): URL {
    const parsed = new URL(apiUrl.trim().replace(/\/+$/, ""));
    return new URL(`${parsed.origin}/api/odata/v3.2/workItems`);
}

interface ODataWorkItem {
    System_Id: number;
    System_Title: string;
    System_WorkItemType: string;
    System_State: string;
    System_AssignedTo?: string;
}

const WORK_ITEM_SELECT = "System_Id,System_Title,System_WorkItemType,System_State,System_AssignedTo,System_CreatedDate";

export interface SevenPaceUser {
    id: string;
    email: string;
    name: string;
}

export async function fetchMe(apiUrl: string, token: string): Promise<SevenPaceUser> {
    const parsed = new URL(apiUrl.trim().replace(/\/+$/, ""));
    const url = new URL(`${parsed.origin}/api/rest/me`);
    url.searchParams.set("api-version", "3.2");

    const res = await fetch(url.toString(), {
        headers: {Authorization: `Bearer ${token}`},
    });

    if (!res.ok) {
        throw new Error(`7pace me: ${res.status} ${await res.text()}`);
    }

    const json = await res.json() as { data: { user: { id: string; email: string; name: string } } };
    const user = json.data.user;
    return {id: user.id, email: user.email, name: user.name};
}

export async function fetchWorkItemTitles(
    apiUrl: string,
    token: string,
    ids: number[]
): Promise<Map<number, string>> {
    const titles = new Map<number, string>();
    if (ids.length === 0) return titles;

    const url = buildODataWorkItemsUrl(apiUrl);
    url.searchParams.set("$filter", `System_Id in (${ids.join(",")})`);
    url.searchParams.set("$select", "System_Id,System_Title");

    const res = await fetch(url.toString(), {
        headers: {Authorization: `Bearer ${token}`},
    });

    if (!res.ok) {
        throw new Error(`7pace workItems: ${res.status} ${await res.text()}`);
    }

    const json = await res.json() as { value: ODataWorkItem[] };
    for (const wi of json.value ?? []) {
        titles.set(wi.System_Id, wi.System_Title);
    }
    return titles;
}

async function runWorkItemsQuery(
    apiUrl: string,
    token: string,
    filter: string,
    maxResults: number
): Promise<SevenPaceWorkItem[]> {
    const url = buildODataWorkItemsUrl(apiUrl);
    url.searchParams.set("$filter", filter);
    url.searchParams.set("$select", WORK_ITEM_SELECT);
    url.searchParams.set("$orderby", "System_CreatedDate desc");
    url.searchParams.set("$top", String(maxResults));

    const res = await fetch(url.toString(), {
        headers: {Authorization: `Bearer ${token}`},
    });

    if (!res.ok) {
        throw new Error(`7pace workItems: ${res.status} ${await res.text()}`);
    }

    const json = await res.json() as { value: ODataWorkItem[] };
    return (json.value ?? []).map((wi) => ({
        id: wi.System_Id,
        title: wi.System_Title,
        type: wi.System_WorkItemType,
        state: wi.System_State,
        assignedTo: wi.System_AssignedTo ? wi.System_AssignedTo.replace(/\s*<[^>]*>\s*$/, "") : undefined,
    }));
}

export async function searchWorkItems(
    apiUrl: string,
    token: string,
    text: string,
    maxResults = 50
): Promise<SevenPaceWorkItem[]> {
    const trimmed = text.trim();

    const filter = /^\d+$/.test(trimmed)
        ? `System_Id eq ${trimmed}`
        : `contains(System_Title,'${trimmed.replace(/'/g, "''")}')`;

    return runWorkItemsQuery(apiUrl, token, filter, maxResults);
}

export async function fetchMyWorkItems(
    apiUrl: string,
    token: string,
    email: string,
    maxResults = 50
): Promise<SevenPaceWorkItem[]> {
    const safe = email.replace(/'/g, "''");
    return runWorkItemsQuery(apiUrl, token, `contains(System_AssignedTo,'${safe}')`, maxResults);
}

export async function testSevenPaceConnection(apiUrl: string, token: string): Promise<void> {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(from.getTime() + 86400000);

    const parsed = buildWorkLogsUrl(apiUrl);
    parsed.searchParams.set("$fromTimestamp", from.toISOString());
    parsed.searchParams.set("$toTimestamp", to.toISOString());

    const res = await fetch(parsed.toString(), {
        headers: {Authorization: `Bearer ${token}`},
    });

    if (res.status === 401 || res.status === 403) {
        throw new Error("Invalid or expired 7pace token");
    }
    if (!res.ok) {
        throw new Error(`${res.status} ${await res.text()}`);
    }
}

export async function fetchWorkLogs(
    apiUrl: string,
    token: string,
    fromDate: string,
    toDate: string
): Promise<SevenPaceWorkLog[]> {

    const parsed = buildWorkLogsUrl(apiUrl);
    parsed.searchParams.set("$fromTimestamp", fromDate);
    parsed.searchParams.set("$toTimestamp", toDate);
    const url = parsed.toString();

    const res = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`7pace workLogs: ${res.status} ${text}`);
    }

    const json = await res.json() as { data: SevenPaceWorkLog[] };
    return json.data ?? [];
}

export function parseLogDate(log: SevenPaceWorkLog): Date {
    const raw = log.timeStamp || log.timestamp || log.date || "";
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
    const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    return new Date(0);
}

export function getLogComment(log: SevenPaceWorkLog): string {
    return log.comment || log.note || "";
}

export async function createWorkLog(
    apiUrl: string,
    token: string,
    workItemId: number,
    timestamp: string,
    durationSeconds: number,
    userId: string,
    activityTypeId?: string,
    comment?: string
): Promise<void> {

    const url = buildWorkLogsUrl(apiUrl).toString();

    const body: Record<string, unknown> = {
        timeStamp: timestamp,
        length: durationSeconds,
        billableLength: durationSeconds,
        workItemId,
        userId,
    };

    if (activityTypeId) {
        body.activityTypeId = activityTypeId;
    }
    if (comment) {
        body.comment = comment;
    }

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`7pace workLog: ${res.status} ${text}`);
    }
}
