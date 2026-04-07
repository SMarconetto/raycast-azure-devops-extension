import {List, ActionPanel, Action, LocalStorage, showToast, Toast, Icon, Color} from "@raycast/api";
import {useState, useEffect, useCallback, useRef} from "react";
import {WorkItem, WiqlResponse, WorkItemsResponse} from "./types/azure-devops";
import {fetchQueryWiql, fetchWorkItemsByIds, buildWorkItemUrl, getWorkItemIcon} from "./utils/azure-devops-helpers"


// ─── Constants ────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

const STATE_COLORS: Record<string, Color> = {
    Active: Color.Blue,
    New: Color.Purple,
    "In Progress": Color.Orange,
    Resolved: Color.Green,
    Done: Color.Green,
    "To Do": Color.Yellow,
    Closed: Color.SecondaryText,
};


// ─── Main component ───────────────────────────────────────────────────

export default function Command() {
    const [searchText, setSearchText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [workItems, setWorkItems] = useState<WorkItem[]>([]);
    const [credentials, setCredentials] = useState<{ org: string; pat: string } | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Carica le credenziali una sola volta all'avvio
    useEffect(() => {
        (async () => {
            const org = await LocalStorage.getItem<string>("org");
            const pat = await LocalStorage.getItem<string>("pat");

            if (!org || !pat) {
                await showToast({
                    style: Toast.Style.Failure,
                    title: "Credenziali mancanti",
                    message: "Configura prima le credenziali Azure DevOps",
                });
                return;
            }

            setCredentials({org, pat});
        })();
    }, []);

    // Logica di ricerca
    const searchWorkItems = useCallback(
        async (text: string) => {
            if (!credentials || text.trim().length < MIN_CHARS) {
                setWorkItems([]);
                return;
            }

            setIsLoading(true);

            try {
                // complex query to devops
                const wiqlRes: WiqlResponse = await fetchQueryWiql(credentials.org, credentials.pat, text);

                // extract ids of retrieved work items
                const ids = wiqlRes.workItems.map((wi) => wi.id);

                if (ids.length === 0) {
                    setWorkItems([]);
                    return;
                }

                // fetch work items details
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

    // Debounce: parte la ricerca solo dopo 400 ms di inattività
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => searchWorkItems(searchText), DEBOUNCE_MS);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [searchText, searchWorkItems]);

    // ─── Render ────────────────────────────────────────────────────────────────

    return (
        <List
            isLoading={isLoading}
            onSearchTextChange={setSearchText}
            searchBarPlaceholder="Cerca work item per titolo o ID..."
            throttle
        >
            {workItems.length === 0 && !isLoading && (
                <List.EmptyView
                    icon={Icon.MagnifyingGlass}
                    title={searchText.length < MIN_CHARS ? "Inizia a digitare" : "Nessun risultato"}
                    description={
                        searchText.length < MIN_CHARS
                            ? `Inserisci almeno ${MIN_CHARS} caratteri`
                            : `Nessun work item trovato per "${searchText}"`
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