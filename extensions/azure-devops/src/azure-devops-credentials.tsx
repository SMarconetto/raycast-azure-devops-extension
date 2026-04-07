import {ActionPanel, Form, Action, showToast, Toast, LocalStorage} from "@raycast/api";
import {useForm} from "@raycast/utils";

type DevopsCredentials = {
    org: string;
    pat: string;
}

export default function Command() {

    const {handleSubmit, itemProps} = useForm<DevopsCredentials>({
        async onSubmit(values) {

            // save credentials on local storage for reuse
            await LocalStorage.setItem("org", values.org);
            await LocalStorage.setItem("pat", values.pat);

            await showToast({
                style: Toast.Style.Success,
                title: "All set",
                message: `Credentials saved`,
            });
        },
        validation: {
            org: (value) => {
                if (!value || value.trim() == "") {
                    return "Invalid organization name"
                }
            },
            pat: (value) => {
                if (!value || value.trim() == "") {
                    return "Invalid PAT";
                }
            },
        },
    });

    return (
        <Form
            actions={
                <ActionPanel>
                    <Action.SubmitForm title="Submit" onSubmit={handleSubmit}/>
                </ActionPanel>
            }>
            <Form.TextField title="Organization name" {...itemProps.org}/>
            <Form.TextField title="PAT" {...itemProps.pat}/>
        </Form>
    );
}