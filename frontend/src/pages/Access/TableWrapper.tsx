import { IconHelp } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteAccessList } from "src/api/backend";
import { HasPermission, LoadingPage, PageCard, PageCardAction, PageCardIconButton } from "src/components";
import { useAccessLists } from "src/hooks";
import { T } from "src/locale";
import { showAccessListModal, showDeleteConfirmModal, showHelpModal } from "src/modals";
import { ACCESS_LISTS, MANAGE } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useAccessLists(["owner", "items", "clients"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteAccessList(id);
		showObjectSuccess("access-list", "deleted");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return item.name.toLowerCase().includes(search);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<PageCard
			title="access-lists"
			search={
				data?.length
					? { value: search, onChange: (v) => setSearch(v.toLowerCase().trim()), placeholder: "Search …" }
					: undefined
			}
			actions={
				<>
					<PageCardIconButton onClick={() => showHelpModal("AccessLists", "cyan")} label="Help">
						<IconHelp size={18} />
					</PageCardIconButton>
					<HasPermission section={ACCESS_LISTS} permission={MANAGE} hideError>
						<PageCardAction onClick={() => showAccessListModal("new")}>
							+ <T id="object.add" tData={{ object: "access-list" }} />
						</PageCardAction>
					</HasPermission>
				</>
			}
		>
			<Table
					data={filtered ?? data ?? []}
					isFetching={isFetching}
					isFiltered={!!filtered}
					onEdit={(id: number) => showAccessListModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "access-list" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["access-lists"], ["access-list", id]],
							children: <T id="object.delete.content" tData={{ object: "access-list" }} />,
						})
					}
					onNew={() => showAccessListModal("new")}
			/>
		</PageCard>
	);
}
