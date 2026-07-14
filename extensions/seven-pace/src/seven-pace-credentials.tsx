import {ActionPanel, Form, Action, showToast, Toast, LocalStorage, Icon, confirmAlert, Alert} from "@raycast/api";
import {useForm} from "@raycast/utils";
import {useState, useEffect, useRef} from "react";
import {testSevenPaceConnection} from "./utils/seven-pace-helpers";

type SevenPaceCredentials = {
    sevenPaceToken: string;
    sevenPaceUrl: string;
    sevenPaceUserId: string;
};

const EMPTY_CREDENTIALS: SevenPaceCredentials = {
    sevenPaceToken: "", sevenPaceUrl: "", sevenPaceUserId: "",
};

function CredentialsForm({initialValues, onLogout}: { initialValues: SevenPaceCredentials; onLogout: () => void }) {
    const tokenRef = useRef(initialValues.sevenPaceToken);
    const urlRef = useRef(initialValues.sevenPaceUrl);

    const {handleSubmit, itemProps} = useForm<SevenPaceCredentials>({
        async onSubmit(values) {
            await LocalStorage.setItem("7pace_token", values.sevenPaceToken);
            await LocalStorage.setItem("7pace_url", values.sevenPaceUrl);
            await LocalStorage.setItem("7pace_user_id", values.sevenPaceUserId);
            await LocalStorage.removeItem("org");
            await LocalStorage.removeItem("pat");

            await showToast({
                style: Toast.Style.Success,
                title: "All set",
                message: "Credentials saved",
            });
        },
        validation: {
            sevenPaceToken: (value) => {
                if (!value || value.trim() == "") return "Invalid 7pace token";
            },
            sevenPaceUrl: (value) => {
                if (!value || value.trim() == "") return "Invalid 7pace URL";
            },
            sevenPaceUserId: (value) => {
                if (!value || value.trim() == "") return "Invalid 7pace User ID";
            },
        },
        initialValues,
    });

    const tokenProps = itemProps.sevenPaceToken;
    const urlProps = itemProps.sevenPaceUrl;

    const wrappedTokenProps = {
        ...tokenProps,
        onChange: (value: string) => { tokenRef.current = value; tokenProps.onChange?.(value); },
    };
    const wrappedUrlProps = {
        ...urlProps,
        onChange: (value: string) => { urlRef.current = value; urlProps.onChange?.(value); },
    };

    async function handleTest7pace() {
        const url = urlRef.current.trim();
        const token = tokenRef.current.trim();

        if (!url || !token) {
            await showToast({style: Toast.Style.Failure, title: "Fill in URL and Token first"});
            return;
        }

        const toast = await showToast({style: Toast.Style.Animated, title: "Testing 7pace..."});
        try {
            await testSevenPaceConnection(url, token);
            toast.style = Toast.Style.Success;
            toast.title = "7pace OK";
        } catch (err) {
            toast.style = Toast.Style.Failure;
            toast.title = "7pace failed";
            toast.message = err instanceof Error ? err.message : "Unknown error";
        }
    }

    async function handleLogout() {
        const confirmed = await confirmAlert({
            title: "Logout",
            message: "This will remove all saved credentials. Continue?",
            primaryAction: {title: "Logout", style: Alert.ActionStyle.Destructive},
        });

        if (!confirmed) return;

        await LocalStorage.removeItem("org");
        await LocalStorage.removeItem("pat");
        await LocalStorage.removeItem("7pace_token");
        await LocalStorage.removeItem("7pace_url");
        await LocalStorage.removeItem("7pace_user_id");

        const check = await Promise.all([
            LocalStorage.getItem<string>("7pace_token"),
            LocalStorage.getItem<string>("7pace_url"),
            LocalStorage.getItem<string>("7pace_user_id"),
        ]);
        if (check.some(Boolean)) {
            await showToast({style: Toast.Style.Failure, title: "Logout failed", message: "Could not clear credentials"});
            return;
        }

        await showToast({style: Toast.Style.Success, title: "Logged out"});
        onLogout();
    }

    return (
        <Form
            actions={
                <ActionPanel>
                    <Action.SubmitForm title="Submit" onSubmit={handleSubmit}/>
                    <Action title="Test 7pace" icon={Icon.Wifi} onAction={handleTest7pace}/>
                    <Action
                        title="Logout"
                        icon={Icon.XMarkCircle}
                        style={Action.Style.Destructive}
                        onAction={handleLogout}
                    />
                </ActionPanel>
            }
        >
            <Form.Description title="7pace Timetracker" text="Configure your 7pace credentials for timesheet logging"/>
            <Form.PasswordField title="API Token" placeholder="Bearer token" {...wrappedTokenProps}/>
            <Form.TextField title="Service URL"
                            placeholder="https://your-instance.timehub.7pace.com" {...wrappedUrlProps}/>
            <Form.TextField title="User ID" placeholder="7pace user UUID" {...itemProps.sevenPaceUserId}/>
        </Form>
    );
}

export default function Command() {
    const [initialValues, setInitialValues] = useState<SevenPaceCredentials | null>(null);
    const [formKey, setFormKey] = useState(0);

    useEffect(() => {
        (async () => {
            const sevenPaceToken = (await LocalStorage.getItem<string>("7pace_token")) ?? "";
            const sevenPaceUrl = (await LocalStorage.getItem<string>("7pace_url")) ?? "";
            const sevenPaceUserId = (await LocalStorage.getItem<string>("7pace_user_id")) ?? "";
            setInitialValues({sevenPaceToken, sevenPaceUrl, sevenPaceUserId});
        })();
    }, []);

    if (!initialValues) {
        return <Form isLoading={true}/>;
    }

    return (
        <CredentialsForm
            key={formKey}
            initialValues={initialValues}
            onLogout={() => {
                setInitialValues(EMPTY_CREDENTIALS);
                setFormKey((k) => k + 1);
            }}
        />
    );
}
