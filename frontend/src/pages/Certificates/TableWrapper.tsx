import { IconHelp } from "@tabler/icons-react";
import { useState } from "react";
import Alert from "react-bootstrap/Alert";
import { deleteCertificate, downloadCertificate } from "src/api/backend";
import { HasPermission, LoadingPage, PageCard, PageCardIconButton } from "src/components";
import { useCertificates } from "src/hooks";
import { T } from "src/locale";
import {
	showCustomCertificateModal,
	showDeleteConfirmModal,
	showDNSCertificateModal,
	showHelpModal,
	showHTTPCertificateModal,
	showRenewCertificateModal,
} from "src/modals";
import { CERTIFICATES, MANAGE } from "src/modules/Permissions";
import { showError, showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useCertificates([
		"owner",
		"dead_hosts",
		"proxy_hosts",
		"redirection_hosts",
		"streams",
	]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	const handleDelete = async (id: number) => {
		await deleteCertificate(id);
		showObjectSuccess("certificate", "deleted");
	};

	const handleDownload = async (id: number) => {
		try {
			await downloadCertificate(id);
		} catch (err: any) {
			showError(err.message);
		}
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter(
			(item) =>
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.niceName.toLowerCase().includes(search),
		);
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<PageCard
			title="certificates"
			search={
				data?.length
					? { value: search, onChange: (v) => setSearch(v.toLowerCase().trim()), placeholder: "Search …" }
					: undefined
			}
			actions={
				<>
					<PageCardIconButton onClick={() => showHelpModal("Certificates", "pink")} label="Help">
						<IconHelp size={18} />
					</PageCardIconButton>
					<HasPermission section={CERTIFICATES} permission={MANAGE} hideError>
						{/* Bleibt ein Aufklappmenue, weil hier drei Ausstellungsarten zur
						    Wahl stehen — als drei Knoepfe waere die Kopfzeile ueberladen. */}
						<div className="dropdown">
							<button type="button" className="btn btn-primary dropdown-toggle" data-bs-toggle="dropdown">
								+ <T id="object.add" tData={{ object: "certificate" }} />
							</button>
											<div className="dropdown-menu">
												<a
													className="dropdown-item"
													href="#"
													onClick={(e) => {
														e.preventDefault();
														showHTTPCertificateModal();
													}}
												>
													<T id="lets-encrypt-via-http" />
												</a>
												<a
													className="dropdown-item"
													href="#"
													onClick={(e) => {
														e.preventDefault();
														showDNSCertificateModal();
													}}
												>
													<T id="lets-encrypt-via-dns" />
												</a>
												<div className="dropdown-divider" />
												<a
													className="dropdown-item"
													href="#"
													onClick={(e) => {
														e.preventDefault();
														showCustomCertificateModal();
													}}
												>
													<T id="certificates.custom" />
								</a>
							</div>
						</div>
					</HasPermission>
				</>
			}
		>
			<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onRenew={showRenewCertificateModal}
					onDownload={handleDownload}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "certificate" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["certificates"], ["certificate", id]],
							children: <T id="object.delete.content" tData={{ object: "certificate" }} />,
						})
				}
			/>
		</PageCard>
	);
}
