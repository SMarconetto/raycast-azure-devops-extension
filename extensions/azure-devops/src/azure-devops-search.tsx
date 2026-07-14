import {List, ActionPanel, Action, LocalStorage, showToast, Toast, Icon, Color} from "@raycast/api";
import {useState, useEffect, useCallback, useRef} from "react";
import {WorkItem, WiqlResponse, WorkItemsResponse} from "./types/azure-devops";
import {fetchQueryWiql, fetchWorkItemsByIds, buildWorkItemUrl, getWorkItemIcon, STATE_COLORS} from "./utils/azure-devops-helpers"

const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

export default function Command() {
    const [searchText, setSearchText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [workItems, setWorkItems] = useState<WorkItem[]>([]);
    const [credentials, setCredentials] = useState<{ org: string; pat: string } | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
                return;
            }

            setCredentials({org, pat});
        })();
    }, []);

    const searchWorkItems = useCallback(
        async (text: string) => {
            if (!credentials || text.trim().length < MIN_CHARS) {
                setWorkItems([]);
                return;
            }

            setIsLoading(true);

            try {
                const wiqlRes: WiqlResponse = await fetchQueryWiql(credentials.org, credentials.pat, text);

                const ids = wiqlRes.workItems.map((wi) => wi.id);

                if (ids.length === 0) {
                    setWorkItems([]);
                    return;
                }

                const workItemsRes: WorkItemsResponse = await fetchWorkItemsByIds(credentials.org, credentials.pat, ids);

                const getWorkItemDate = (wi: WorkItem) => {
                    const d = wi.fields["System.CreatedDate"] ?? wi.fields["System.ChangedDate"];
                    return d ? new Date(String(d)).getTime() : 0;
                };

                const sortedWorkItems = workItemsRes.value.slice()
                    .sort((a, b) => getWorkItemDate(b) - getWorkItemDate(a));

                setWorkItems(sortedWorkItems);

            } catch (err) {

                await showToast({
                    style: Toast.Style.Failure,
                    title: "Search error",
                    message: err instanceof Error ? err.message : "Generic error",
                });

                setWorkItems([]);
            } finally {
                setIsLoading(false);
            }
        },
        [credentials]
    );

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchWorkItems(searchText), DEBOUNCE_MS);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [searchText, searchWorkItems]);

    return (
        <List
            isLoading={isLoading}
            onSearchTextChange={setSearchText}
            searchBarPlaceholder="Search work items by title or ID..."
            throttle
        >
            {workItems.length === 0 && !isLoading && (
                <List.EmptyView
                    icon={Icon.MagnifyingGlass}
                    title={searchText.length < MIN_CHARS ? "Start typing" : "No results"}
                    description={
                        searchText.length < MIN_CHARS
                            ? `Enter at least ${MIN_CHARS} characters`
                            : `No work items found for "${searchText}"`
                    }
                />
            )}

            {workItems.map((item) => {
                const assignee = item.fields["System.AssignedTo"];
                return (
                    <List.Item
                        key={item.id}
                        icon={{
                            source: getWorkItemIcon(item.fields["System.WorkItemType"]),
                            tintColor: Color.Blue,
                        }}
                        title={item.fields["System.Title"]}
                        subtitle={`#${item.id} · ${item.fields["System.WorkItemType"]}`}
                        accessories={[
                            ...(assignee ? [{text: assignee.displayName, icon: Icon.Person}] : []),
                            {
                                tag: {
                                    value: item.fields["System.State"],
                                    color: STATE_COLORS[item.fields["System.State"]] ?? Color.SecondaryText,
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
                );
            })}
        </List>
    );
}