import {List, ActionPanel, Action, LocalStorage, showToast, Toast, Icon, Color, Form, useNavigation} from "@raycast/api";
import {useState, useEffect, useCallback, useRef} from "react";
import {SevenPaceActivityType, SevenPaceWorkItem} from "./types/seven-pace";
import {createWorkLog, searchWorkItems as fetchWorkItemSearch, fetchMe, fetchMyWorkItems, fetchActivityTypes, getWorkItemIcon, STATE_COLORS} from "./utils/seven-pace-helpers";

const DEBOUNCE_MS = 400;
const MIN_CHARS = 2;

function LogTimeForm({workItem, sevenPaceUrl, sevenPaceToken, sevenPaceUserId, activityTypes}: {
    workItem: SevenPaceWorkItem;
    sevenPaceUrl: string;
    sevenPaceToken: string;
    sevenPaceUserId: string;
    activityTypes: SevenPaceActivityType[];
}) {
    const {pop} = useNavigation();

    async function handleSubmit(values: { date: Date; hours: string; activityTypeId: string; comment: string }) {
        const hours = parseFloat(values.hours);
        if (isNaN(hours) || hours <= 0) {
            await showToast({style: Toast.Style.Failure, title: "Invalid hours"});
            return;
        }

        try {
            const ts = new Date(values.date);
            ts.setHours(8, 0, 0, 0);

            await createWorkLog(
                sevenPaceUrl,
                sevenPaceToken,
                workItem.id,
                ts.toISOString(),
                hours * 3600,
                sevenPaceUserId,
                values.activityTypeId || undefined,
                values.comment || undefined
            );

            await showToast({
                style: Toast.Style.Success,
                title: "Hours logged",
                message: `${hours}h on #${workItem.id}`,
            });
            pop();
        } catch (err) {
            await showToast({
                style: Toast.Style.Failure,
                title: "Error",
                message: err instanceof Error ? err.message : "Unknown error",
            });
        }
    }

    return (
        <Form
            navigationTitle={`Log Time - #${workItem.id} ${workItem.title}`}
            actions={
                <ActionPanel>
                    <Action.SubmitForm title="Log Time" onSubmit={handleSubmit}/>
                </ActionPanel>
            }
        >
            <Form.DatePicker id="date" title="Date" type={Form.DatePicker.Type.Date} defaultValue={new Date()}/>
            <Form.TextField id="hours" title="Duration (hours)" placeholder="e.g. 1.5"/>
            <Form.Dropdown id="activityTypeId" title="Activity type" defaultValue="">
                <Form.Dropdown.Item value="" title="-- None --"/>
                {activityTypes.map((at) => (
                    <Form.Dropdown.Item key={at.id} value={at.id} title={at.name}/>
                ))}
            </Form.Dropdown>
            <Form.TextField id="comment" title="Note" placeholder="Optional description"/>
        </Form>
    );
}

export default function Command() {
    const [isLoading, setIsLoading] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [workItems, setWorkItems] = useState<SevenPaceWorkItem[]>([]);
    const [myItems, setMyItems] = useState<SevenPaceWorkItem[]>([]);
    const [activityTypes, setActivityTypes] = useState<SevenPaceActivityType[]>([]);
    const [credentials, setCredentials] = useState<{
        sevenPaceUrl: string;
        sevenPaceToken: string;
        sevenPaceUserId: string;
    } | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        (async () => {
            const url = await LocalStorage.getItem<string>("7pace_url");
            const token = await LocalStorage.getItem<string>("7pace_token");
            const userId = await LocalStorage.getItem<string>("7pace_user_id");

            if (!url || !token || !userId) {
                await showToast({
                    style: Toast.Style.Failure,
                    title: "Missing 7pace credentials",
                    message: "Configure credentials in Credentials 7pace",
                });
                return;
            }

            setCredentials({sevenPaceUrl: url, sevenPaceToken: token, sevenPaceUserId: userId});
        })();
    }, []);

    useEffect(() => {
        if (!credentials) return;
        (async () => {
            setIsLoading(true);
            try {
                const me = await fetchMe(credentials.sevenPaceUrl, credentials.sevenPaceToken);
                const [items, types] = await Promise.all([
                    fetchMyWorkItems(credentials.sevenPaceUrl, credentials.sevenPaceToken, me.email),
                    fetchActivityTypes(credentials.sevenPaceUrl, credentials.sevenPaceToken).catch(() => []),
                ]);
                setMyItems(items);
                setActivityTypes(types);
            } catch (err) {
                await showToast({
                    style: Toast.Style.Failure,
                    title: "Error loading your work items",
                    message: err instanceof Error ? err.message : "Unknown error",
                });
            } finally {
                setIsLoading(false);
            }
        })();
    }, [credentials]);

    const searchWorkItems = useCallback(
        async (text: string) => {
            if (!credentials || text.trim().length < MIN_CHARS) {
                setWorkItems([]);
                return;
            }

            setIsLoading(true);
            try {
                const results = await fetchWorkItemSearch(credentials.sevenPaceUrl, credentials.sevenPaceToken, text);
                setWorkItems(results);
            } catch (err) {
                await showToast({
                    style: Toast.Style.Failure,
                    title: "Search error",
                    message: err instanceof Error ? err.message : "Unknown error",
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

    const isSearching = searchText.trim().length >= MIN_CHARS;
    const displayedItems = isSearching ? workItems : myItems;

    return (
        <List
            isLoading={isLoading}
            onSearchTextChange={setSearchText}
            searchBarPlaceholder="Search work items by title or ID..."
            throttle
        >
            {displayedItems.length === 0 && !isLoading && (
                <List.EmptyView
                    icon={Icon.MagnifyingGlass}
                    title={isSearching ? "No results" : "No work items assigned to you"}
                    description={
                        isSearching
                            ? `No work items found for "${searchText}"`
                            : "Type to search all work items by title or ID"
                    }
                />
            )}

            <List.Section title={isSearching ? "Results" : "My work items"}>
            {displayedItems.map((item) => {
                return (
                    <List.Item
                        key={item.id}
                        icon={{
                            source: getWorkItemIcon(item.type),
                            tintColor: Color.Blue,
                        }}
                        title={item.title}
                        subtitle={`#${item.id} · ${item.type}`}
                        accessories={[
                            ...(item.assignedTo ? [{text: item.assignedTo, icon: Icon.Person}] : []),
                            {
                                tag: {
                                    value: item.state,
                                    color: STATE_COLORS[item.state] ?? Color.SecondaryText,
                                },
                            },
                        ]}
                        actions={
                            credentials ? (
                                <ActionPanel>
                                    <Action.Push
                                        title="Log Time"
                                        icon={Icon.Clock}
                                        target={
                                            <LogTimeForm
                                                workItem={item}
                                                sevenPaceUrl={credentials.sevenPaceUrl}
                                                sevenPaceToken={credentials.sevenPaceToken}
                                                sevenPaceUserId={credentials.sevenPaceUserId}
                                                activityTypes={activityTypes}
                                            />
                                        }
                                    />
                                </ActionPanel>
                            ) : undefined
                        }
                    />
                );
            })}
            </List.Section>
        </List>
    );
}
