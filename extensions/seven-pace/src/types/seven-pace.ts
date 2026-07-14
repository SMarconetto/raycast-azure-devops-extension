export interface SevenPaceWorkLog {
    id: string;
    workItemId: number;
    timeStamp: string;
    timestamp?: string;
    date?: string;
    length: number;
    billableLength: number;
    comment: string;
    note?: string;
    activityTypeId?: string;
    userId?: string;
}

export interface SevenPaceActivityType {
    id: string;
    name: string;
}

export interface SevenPaceWorkItem {
    id: number;
    title: string;
    type: string;
    state: string;
    assignedTo?: string;
}
