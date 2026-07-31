import Alert from "react-bootstrap/Alert";
import { LoadingPage, PageCard } from "src/components";
import { useAuditLogs } from "src/hooks";
import { showEventDetailsModal } from "src/modals";
import Table from "./Table";

export default function TableWrapper() {
	const { isFetching, isLoading, isError, error, data } = useAuditLogs(["user"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return <Alert variant="danger">{error?.message || "Unknown error"}</Alert>;
	}

	return (
		<PageCard title="auditlogs">
			<Table data={data ?? []} isFetching={isFetching} onSelectItem={showEventDetailsModal} />
		</PageCard>
	);
}
