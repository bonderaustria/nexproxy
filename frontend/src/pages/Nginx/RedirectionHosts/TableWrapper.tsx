import { IconHelp } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteRedirectionHost, toggleRedirectionHost } from "src/api/backend";
import { HasPermission, LoadingPage, PageCard, PageCardAction, PageCardIconButton } from "src/components";
import { useRedirectionHosts } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showRedirectionHostModal } from "src/modals";
import { MANAGE, REDIRECTION_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useRedirectionHosts(["owner", "certificate"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteRedirectionHost(id);
		showObjectSuccess("redirection-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleRedirectionHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["redirection-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["redirection-host", id] });
		showObjectSuccess("redirection-host", enabled ? "enabled" : "disabled");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return (
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.forwardDomainName.toLowerCase().includes(search)
			);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<PageCard
			title="redirection-hosts"
			search={
				data?.length
					? { value: search, onChange: (v) => setSearch(v.toLowerCase().trim()), placeholder: "Suchen …" }
					: undefined
			}
			actions={
				<>
					<PageCardIconButton onClick={() => showHelpModal("RedirectionHosts", "yellow")} label="Hilfe">
						<IconHelp size={18} />
					</PageCardIconButton>
					<HasPermission section={REDIRECTION_HOSTS} permission={MANAGE} hideError>
						<PageCardAction onClick={() => showRedirectionHostModal("new")}>
							+ <T id="object.add" tData={{ object: "redirection-host" }} />
						</PageCardAction>
					</HasPermission>
				</>
			}
		>
			<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onEdit={(id: number) => showRedirectionHostModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "redirection-host" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["redirection-hosts"], ["redirection-host", id]],
							children: <T id="object.delete.content" tData={{ object: "redirection-host" }} />,
						})
					}
					onDisableToggle={handleDisableToggle}
				onNew={() => showRedirectionHostModal("new")}
			/>
		</PageCard>
	);
}
