import { IconHelp } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteProxyHost, toggleProxyHost } from "src/api/backend";
import { HasPermission, LoadingPage, PageCard, PageCardAction, PageCardIconButton } from "src/components";
import { useProxyHosts } from "src/hooks";
import { T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showProxyHostModal } from "src/modals";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useProxyHosts(["owner", "access_list", "certificate"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteProxyHost(id);
		showObjectSuccess("proxy-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleProxyHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["proxy-host", id] });
		showObjectSuccess("proxy-host", enabled ? "enabled" : "disabled");
	};

	const term = search.toLowerCase().trim();
	const filtered = term
		? (data ?? []).filter(
				(item) =>
					item.domainNames.some((domain: string) => domain.toLowerCase().includes(term)) ||
					item.forwardHost.toLowerCase().includes(term) ||
					`${item.forwardPort}`.includes(term),
			)
		: null;

	return (
		<PageCard
			title="proxy-hosts"
			subtitle="proxy-hosts.subtitle"
			search={
				data?.length
					? { value: search, onChange: setSearch, placeholder: "Domain or destination …" }
					: undefined
			}
			actions={
				<>
					<PageCardIconButton onClick={() => showHelpModal("ProxyHosts", "lime")} label="Help">
						<IconHelp size={18} />
					</PageCardIconButton>
					<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
						<PageCardAction onClick={() => showProxyHostModal("new")}>
							+ <T id="object.add" tData={{ object: "proxy-host" }} />
						</PageCardAction>
					</HasPermission>
				</>
			}
		>
			<Table
				data={filtered ?? data ?? []}
				isFiltered={!!term}
				isFetching={isFetching}
				onEdit={(id: number) => showProxyHostModal(id)}
				onDelete={(id: number) => {
					const host = data?.find((h) => h.id === id);
					showDeleteConfirmModal({
						title: <T id="object.delete" tData={{ object: "proxy-host" }} />,
						onConfirm: () => handleDelete(id),
						invalidations: [["proxy-hosts"], ["proxy-host", id]],
						children: (
							<>
								<T id="object.delete.content" tData={{ object: "proxy-host" }} />
								{host?.domainNames?.length ? (
									<div className="mt-2 fw-bold text-break">{host.domainNames.join(", ")}</div>
								) : null}
								{host?.forwardHost ? (
									<div className="mt-1 text-muted small">
										({host.forwardScheme}://{host.forwardHost}:{host.forwardPort})
									</div>
								) : null}
							</>
						),
					});
				}}
				onDisableToggle={handleDisableToggle}
				onNew={() => showProxyHostModal("new")}
			/>
		</PageCard>
	);
}
