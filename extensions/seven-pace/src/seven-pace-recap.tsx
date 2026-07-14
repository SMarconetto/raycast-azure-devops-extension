import {List, ActionPanel, Action, LocalStorage, showToast, Toast, Icon, Keyboard} from "@raycast/api";
import {useState, useEffect} from "react";
import {SevenPaceWorkLog} from "./types/seven-pace";
import {fetchWorkLogs, fetchWorkItemTitles, parseLogDate, getLogComment} from "./utils/seven-pace-helpers";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type ViewMode = "calendar" | "task";

function getMonthOptions(): { value: string; title: string }[] {
    const options: { value: string; title: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const title = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
        options.push({value, title});
    }
    return options;
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + "...";
}

function buildCalendarMarkdown(
    year: number,
    month: number,
    hoursByDay: Map<number, number>,
    totalHours: number,
    selectedDay?: number
): string {
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    let md = `## ${MONTH_NAMES[month]} ${year}\n\n`;
    md += `| ${DAY_HEADERS.join(" | ")} |\n`;
    md += `| ${DAY_HEADERS.map(() => "---").join(" | ")} |\n`;

    let row = "| ";
    for (let i = 0; i < startDow; i++) {
        row += "  | ";
    }

    let col = startDow;
    for (let day = 1; day <= daysInMonth; day++) {
        const hours = hoursByDay.get(day) ?? 0;
        let cell: string;
        if (selectedDay === day) {
            cell = hours > 0 ? `> **${day}** (${hours.toFixed(1)}h) <` : `> ${day} <`;
        } else {
            cell = hours > 0 ? `**${day}** (${hours.toFixed(1)}h)` : `${day}`;
        }
        row += `${cell} | `;
        col++;

        if (col === 7) {
            md += row + "\n";
            row = "| ";
            col = 0;
        }
    }

    if (col > 0) {
        for (let i = col; i < 7; i++) {
            row += "  | ";
        }
        md += row + "\n";
    }

    md += `\n**Monthly total: ${totalHours.toFixed(1)}h**`;
    return md;
}

function buildTaskBreakdown(allLogs: SevenPaceWorkLog[], titles: Map<number, string>): string {
    const taskHrs = new Map<number, number>();
    for (const log of allLogs) {
        taskHrs.set(log.workItemId, (taskHrs.get(log.workItemId) ?? 0) + log.length / 3600);
    }
    if (taskHrs.size === 0) return "";

    const sorted = Array.from(taskHrs.entries()).sort((a, b) => b[1] - a[1]);

    let md = "\n\n---\n\n### Task breakdown\n\n";
    md += "| Work Item | Hours |\n";
    md += "| --- | --- |\n";
    for (const [id, hours] of sorted) {
        const title = titles.get(id);
        const label = title ? `#${id} ${truncate(title, 40)}` : `#${id}`;
        md += `| ${label} | ${hours.toFixed(1)}h |\n`;
    }
    return md;
}

function buildDayDetail(
    year: number,
    month: number,
    hoursByDay: Map<number, number>,
    totalHours: number,
    day: number,
    dayLogs: SevenPaceWorkLog[],
    allLogs: SevenPaceWorkLog[],
    titles: Map<number, string>
): string {
    let md = buildCalendarMarkdown(year, month, hoursByDay, totalHours, day);

    md += `\n\n---\n\n### ${day} ${MONTH_NAMES[month]}\n\n`;

    if (dayLogs.length === 0) {
        md += "No entries";
        md += buildTaskBreakdown(allLogs, titles);
        return md;
    }

    md += "| Task | Duration | Note |\n";
    md += "| --- | --- | --- |\n";

    const sorted = dayLogs.slice().sort((a, b) => parseLogDate(a).getTime() - parseLogDate(b).getTime());

    for (const log of sorted) {
        const title = titles.get(log.workItemId) ?? "";
        const taskLabel = title ? `#${log.workItemId} ${truncate(title, 30)}` : `#${log.workItemId}`;
        const hours = (log.length / 3600).toFixed(1);
        const comment = getLogComment(log);
        md += `| ${taskLabel} | ${hours}h | ${comment ? truncate(comment, 35) : "-"} |\n`;
    }

    const dayTotal = dayLogs.reduce((sum, l) => sum + l.length / 3600, 0);
    md += `\n**Day total: ${dayTotal.toFixed(1)}h**`;

    md += buildTaskBreakdown(allLogs, titles);

    return md;
}

function buildTaskDetail(
    year: number,
    month: number,
    hoursByDay: Map<number, number>,
    totalHours: number,
    workItemId: number,
    taskLogs: SevenPaceWorkLog[],
    titles: Map<number, string>
): string {
    let md = buildCalendarMarkdown(year, month, hoursByDay, totalHours);

    const title = titles.get(workItemId) ?? "";
    const taskTotal = taskLogs.reduce((sum, l) => sum + l.length / 3600, 0);

    md += `\n\n---\n\n### #${workItemId}${title ? ` - ${title}` : ""}\n\n`;
    md += `**Total: ${taskTotal.toFixed(1)}h**\n\n`;
    md += "| Date | Duration | Note |\n";
    md += "| --- | --- | --- |\n";

    const sorted = taskLogs.slice().sort((a, b) => parseLogDate(a).getTime() - parseLogDate(b).getTime());
    for (const log of sorted) {
        const d = parseLogDate(log);
        const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
        const hours = (log.length / 3600).toFixed(1);
        const comment = getLogComment(log);
        md += `| ${dateStr} | ${hours}h | ${comment ? truncate(comment, 35) : "-"} |\n`;
    }

    md += buildTaskBreakdown(taskLogs, titles);

    return md;
}

export default function Command() {
    const [isLoading, setIsLoading] = useState(true);
    const [logs, setLogs] = useState<SevenPaceWorkLog[]>([]);
    const [titles, setTitles] = useState<Map<number, string>>(new Map());
    const [viewMode, setViewMode] = useState<ViewMode>("calendar");
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    });

    const monthOptions = getMonthOptions();

    useEffect(() => {
        (async () => {
            const url = await LocalStorage.getItem<string>("7pace_url");
            const token = await LocalStorage.getItem<string>("7pace_token");

            if (!url || !token) {
                await showToast({
                    style: Toast.Style.Failure,
                    title: "Missing 7pace credentials",
                    message: "Configure credentials in Credentials 7pace",
                });
                setIsLoading(false);
                return;
            }

            await loadMonth(url, token, selectedMonth);
        })();
    }, [selectedMonth]);

    async function loadMonth(url: string, token: string, month: string) {
        setIsLoading(true);
        try {
            const [yearStr, monthStr] = month.split("-");
            const year = parseInt(yearStr);
            const m = parseInt(monthStr) - 1;
            const from = new Date(year, m, 1);
            const to = new Date(year, m + 1, 1);

            const data = await fetchWorkLogs(url, token, from.toISOString(), to.toISOString());
            setLogs(data);

            const uniqueIds = [...new Set(data.map((l) => l.workItemId))];
            await loadTitles(url, token, uniqueIds);
        } catch (err) {
            await showToast({
                style: Toast.Style.Failure,
                title: "Error",
                message: err instanceof Error ? err.message : "Unknown error",
            });
            setLogs([]);
        }
        setIsLoading(false);
    }

    async function loadTitles(url: string, token: string, ids: number[]) {
        if (ids.length === 0) return;

        let titleMap = new Map<number, string>();
        try {
            titleMap = await fetchWorkItemTitles(url, token, ids);
        } catch {
            titleMap = new Map();
        }

        setTitles(titleMap);
    }

    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const logsByDay = new Map<number, SevenPaceWorkLog[]>();
    const hoursByDay = new Map<number, number>();
    let totalHours = 0;
    for (const log of logs) {
        const d = parseLogDate(log);
        const day = d.getDate();
        if (!logsByDay.has(day)) logsByDay.set(day, []);
        logsByDay.get(day)!.push(log);
        const h = log.length / 3600;
        hoursByDay.set(day, (hoursByDay.get(day) ?? 0) + h);
        totalHours += h;
    }

    const taskHours = new Map<number, number>();
    for (const log of logs) {
        taskHours.set(log.workItemId, (taskHours.get(log.workItemId) ?? 0) + log.length / 3600);
    }
    const sortedTasks = Array.from(taskHours.entries()).sort((a, b) => b[1] - a[1]);

    const days: { day: number; dayName: string; hours: number; logs: SevenPaceWorkLog[] }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const dayLogs = logsByDay.get(d) ?? [];
        const hours = hoursByDay.get(d) ?? 0;
        if (hours > 0) {
            days.push({day: d, dayName: SHORT_DAY_NAMES[date.getDay()], hours, logs: dayLogs});
        }
    }

    const toggleLabel = viewMode === "calendar" ? "Task breakdown" : "Calendar";
    const toggleIcon = viewMode === "calendar" ? Icon.List : Icon.Calendar;

    return (
        <List
            isLoading={isLoading}
            isShowingDetail
            searchBarPlaceholder={viewMode === "calendar" ? "Filter days..." : "Filter tasks..."}
            searchBarAccessory={
                <List.Dropdown
                    tooltip="Select month"
                    value={selectedMonth}
                    onChange={setSelectedMonth}
                >
                    {monthOptions.map((opt) => (
                        <List.Dropdown.Item key={opt.value} value={opt.value} title={opt.title}/>
                    ))}
                </List.Dropdown>
            }
        >
            {viewMode === "calendar" && (
                <List.Section title={`${totalHours.toFixed(1)}h`}>
                    {days.map((d) => (
                        <List.Item
                            key={d.day}
                            icon={Icon.Calendar}
                            title={`${d.day} ${d.dayName}`}
                            subtitle={`${d.hours.toFixed(1)}h`}
                            detail={
                                <List.Item.Detail
                                    markdown={buildDayDetail(year, month, hoursByDay, totalHours, d.day, d.logs, logs, titles)}
                                />
                            }
                            actions={
                                <ActionPanel>
                                    <Action
                                        title={`Switch to ${toggleLabel}`}
                                        icon={toggleIcon}
                                        shortcut={{modifiers: ["cmd"], key: "t"} as Keyboard.Shortcut}
                                        onAction={() => setViewMode("task")}
                                    />
                                </ActionPanel>
                            }
                        />
                    ))}
                </List.Section>
            )}

            {viewMode === "task" && (
                <List.Section title={`Task - ${totalHours.toFixed(1)}h`}>
                    {sortedTasks.map(([id, hours]) => {
                        const title = titles.get(id);
                        const taskLogs = logs.filter((l) => l.workItemId === id);
                        return (
                            <List.Item
                                key={id}
                                icon={Icon.Checkmark}
                                title={`#${id}`}
                                subtitle={title ? truncate(title, 30) : undefined}
                                accessories={[{text: `${hours.toFixed(1)}h`}]}
                                detail={
                                    <List.Item.Detail
                                        markdown={buildTaskDetail(year, month, hoursByDay, totalHours, id, taskLogs, titles)}
                                    />
                                }
                                actions={
                                    <ActionPanel>
                                        <Action
                                            title={`Switch to ${toggleLabel}`}
                                            icon={toggleIcon}
                                            shortcut={{modifiers: ["cmd"], key: "t"} as Keyboard.Shortcut}
                                            onAction={() => setViewMode("calendar")}
                                        />
                                        <Action.CopyToClipboard title="Copy ID" content={String(id)}/>
                                    </ActionPanel>
                                }
                            />
                        );
                    })}
                </List.Section>
            )}
        </List>
    );
}
