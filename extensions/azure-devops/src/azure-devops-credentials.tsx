import {ActionPanel, Form, Action, showToast, Toast, LocalStorage, Icon, confirmAlert, Alert} from "@raycast/api";
import {useForm} from "@raycast/utils";
import {useState, useEffect, useRef} from "react";
import {testConnection} from "./utils/azure-devops-helpers";

type DevopsCredentials = {
    org: string;
    pat: string;
};

const EMPTY_CREDENTIALS: DevopsCredentials = {org: "", pat: ""};

function CredentialsForm({initialValues, onLogout}: { initialValues: DevopsCredentials; onLogout: () => void }) {
    const orgRef = useRef(initialValues.org);
    const patRef = useRef(initialValues.pat);

    const {handleSubmit, itemProps} = useForm<DevopsCredentials>({
        async onSubmit(values) {
            await LocalStorage.setItem("org", values.org);
            await LocalStorage.setItem("pat", values.pat);

            await showToast({
                style: Toast.Style.Success,
                title: "All set",
                message: "Credentials saved",
            });
        },
        validation: {
            org: (value) => {
                if (!value || value.trim() == "") {
                    return "Invalid organization name";
                }
            },
            pat: (value) => {
                if (!value || value.trim() == "") {
                    return "Invalid PAT";
                }
            },
        },
        initialValues,
    });

    const orgProps = itemProps.org;
    const patProps = itemProps.pat;

    const wrappedOrgProps = {
        ...orgProps,
        onChange: (value: string) => {
            orgRef.current = value;
            orgProps.onChange?.(value);
        },
    };

    const wrappedPatProps = {
        ...patProps,
        onChange: (value: string) => {
            patRef.current = value;
            patProps.onChange?.(value);
        },
    };

    async function handleTestConnection() {
        const org = orgRef.current.trim();
        const pat = patRef.current.trim();

        if (!org || !pat) {
            await showToast({style: Toast.Style.Failure, title: "Fill in org and PAT first"});
            return;
        }

        const toast = await showToast({style: Toast.Style.Animated, title: "Testing connection..."});
        try {
            await testConnection(org, pat);
            await LocalStorage.setItem("org", org);
            await LocalStorage.setItem("pat", pat);
            toast.style = Toast.Style.Success;
            toast.title = "Connection successful";
            toast.message = "Credentials saved";
        } catch (err) {
            toast.style = Toast.Style.Failure;
            toast.title = "Connection failed";
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

        const orgCheck = await LocalStorage.getItem<string>("org");
        const patCheck = await LocalStorage.getItem<string>("pat");
        if (orgCheck || patCheck) {
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
                    <Action title="Test Connection" icon={Icon.Wifi} onAction={handleTestConnection}/>
                    <Action
                        title="Logout"
                        icon={Icon.XMarkCircle}
                        style={Action.Style.Destructive}
                        onAction={handleLogout}
                    />
                </ActionPanel>
            }
        >
            <Form.Description title="Azure DevOps" text="Configure your Azure DevOps credentials"/>
            <Form.TextField title="Organization name" {...wrappedOrgProps}/>
            <Form.PasswordField title="PAT" {...wrappedPatProps}/>
        </Form>
    );
}

export default function Command() {
    const [initialValues, setInitialValues] = useState<DevopsCredentials | null>(null);
    const [formKey, setFormKey] = useState(0);

    useEffect(() => {
        (async () => {
            const org = (await LocalStorage.getItem<string>("org")) ?? "";
            const pat = (await LocalStorage.getItem<string>("pat")) ?? "";
            setInitialValues({org, pat});
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
