export interface WorkItemRef {
    id: number;
    url: string;
}

export interface WorkItem {
    id: number;
    fields: {
        "System.Title": string;
        "System.State": string;
        "System.WorkItemType": string;
        "System.AssignedTo"?: { displayName: string };
        "System.CreatedDate"?: Date
        "System.ChangedDate"?: Date
    };
}

export interface WiqlResponse {
    workItems: WorkItemRef[];
}

export interface WorkItemsResponse {
    value: WorkItem[];
}