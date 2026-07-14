import {List, ActionPanel, Action, LocalStorage, showToast, Toast, Icon, Color} from "@raycast/api";
import {useState, useEffect} from "react";
import {WorkItem} from "./types/azure-devops";
import {fetchMyWorkItems, fetchWorkItemsByIds, buildWorkItemUrl, getWorkItemIcon, STATE_COLORS} from "./utils/azure-devops-helpers";

const STATE_ORDER: Record<string, number> = {
    "In Progress": 0,
    Active: 1,
    New: 2,
    "To Do": 3,
    Resolved: 4,
    Done: 99,
};

export default function Command() {
    const [isLoading, setIsLoading] = useState(true);
    const [workItems, setWorkItems] = useState<WorkItem[]>([]);
    const [credentials, setCredentials] = useState<{ org: string; pat: string } | null>(null);

    useEffect(() => {
        (async () => {
            const org = await LocalStorage.getItem<string>("org");
            const pat = await LocalStorage.getItem<string>("pat");

            if (!org || !pat) {
                await showToast({
                    style: Toast.Style.Failure,
                    title: "Missing credentials",
                    message: "Configure your Azure DevOps credentials first",
                });
                setIsLoading(false);
                return;
            }

            setCredentials({org, pat});
        })();
    }, []);

    useEffect(() => {
        if (!credentials) return;

        (async () => {
            setIsLoading(true);
            try {
                const wiqlRes = await fetchMyWorkItems(credentials.org, credentials.pat);
                const ids = wiqlRes.workItems.map((wi) => wi.id);

                if (ids.length === 0) {
                    setWorkItems([]);
                    return;
                }

                const res = await fetchWorkItemsByIds(credentials.org, credentials.pat, ids);
                setWorkItems(res.value);
            } catch (err) {
                await showToast({
                    style: Toast.Style.Failure,
                    title: "Error",
                    message: err instanceof Error ? err.message : "Unknown error",
                });
                setWorkItems([]);
            } finally {
                setIsLoading(false);
            }
        })();
    }, [credentials]);

    const sorted = workItems.slice().sort((a, b) => {
        const da = a.fields["System.ChangedDate"];
        const db = b.fields["System.ChangedDate"];
        return (db ? new Date(String(db)).getTime() : 0) - (da ? new Date(String(da)).getTime() : 0);
    });

    const grouped = new Map<string, WorkItem[]>();
    for (const item of sorted) {
        const state = item.fields["System.State"];
        if (!grouped.has(state)) grouped.set(state, []);
        grouped.get(state)!.push(item);
    }

    const sections = Array.from(grouped.entries()).sort(
        (a, b) => (STATE_ORDER[a[0]] ?? 50) - (STATE_ORDER[b[0]] ?? 50)
    );

    return (
        <List isLoading={isLoading} searchBarPlaceholder="Filter your work items...">
            {sections.length === 0 && !isLoading && (
                <List.EmptyView
                    icon={Icon.Checkmark}
                    title="No assigned work items"
                    description="You have no open work items assigned to you"
                />
            )}

            {sections.map(([state, items]) => (
                <List.Section key={state} title={state} subtitle={`${items.length}`}>
                    {items.map((item) => (
                        <List.Item
                            key={item.id}
                            icon={{
                                source: getWorkItemIcon(item.fields["System.WorkItemType"]),
                                tintColor: Color.Blue,
                            }}
                            title={item.fields["System.Title"]}
                            subtitle={`#${item.id} · ${item.fields["System.WorkItemType"]}`}
                            accessories={[
                                {
                                    tag: {
                                        value: state,
                                        color: STATE_COLORS[state] ?? Color.SecondaryText,
                                    },
                                },
                            ]}
                            actions={
                                <ActionPanel>
                                    <Action.OpenInBrowser title="Open in Browser"
                                                          url={buildWorkItemUrl(credentials!.org, item.id)}/>
                                    <Action.CopyToClipboard title="Copy URL"
                                                            content={buildWorkItemUrl(credentials!.org, item.id)}/>
                                    <Action.CopyToClipboard title="Copy ID" content={String(item.id)}/>
                                </ActionPanel>
                            }
                        />
                    ))}
                </List.Section>
            ))}
        </List>
    );
}
