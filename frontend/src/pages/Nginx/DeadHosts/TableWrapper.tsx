import { IconHelp } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteDeadHost, toggleDeadHost } from "src/api/backend";
import { HasPermission, LoadingPage, PageCard, PageCardAction, PageCardIconButton } from "src/components";
import { useDeadHosts } from "src/hooks";
import { T } from "src/locale";
import { showDeadHostModal, showDeleteConfirmModal, showHelpModal } from "src/modals";
import { DEAD_HOSTS, MANAGE } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useDeadHosts(["owner", "certificate"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteDeadHost(id);
		showObjectSuccess("dead-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleDeadHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["dead-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["dead-host", id] });
		showObjectSuccess("dead-host", enabled ? "enabled" : "disabled");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return item.domainNames.some((domain: string) => domain.toLowerCase().includes(search));
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<PageCard
			title="dead-hosts"
			search={
				data?.length
					? { value: search, onChange: (v) => setSearch(v.toLowerCase().trim()), placeholder: "Search …" }
					: undefined
			}
			actions={
				<>
					<PageCardIconButton onClick={() => showHelpModal("DeadHosts", "red")} label="Help">
						<IconHelp size={18} />
					</PageCardIconButton>
					<HasPermission section={DEAD_HOSTS} permission={MANAGE} hideError>
						<PageCardAction onClick={() => showDeadHostModal("new")}>
							+ <T id="object.add" tData={{ object: "dead-host" }} />
						</PageCardAction>
					</HasPermission>
				</>
			}
		>
			<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onEdit={(id: number) => showDeadHostModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "dead-host" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["dead-hosts"], ["dead-host", id]],
							children: <T id="object.delete.content" tData={{ object: "dead-host" }} />,
						})
					}
					onDisableToggle={handleDisableToggle}
				onNew={() => showDeadHostModal("new")}
			/>
		</PageCard>
	);
}
