import { useQuery } from "@tanstack/react-query";
import { getHAProvisionStatus, type ProvisionJob } from "src/api/backend";

const useHAProvisionStatus = (enabled: boolean) => {
	return useQuery<ProvisionJob, Error>({
		queryKey: ["ha-provision-status"],
		queryFn: getHAProvisionStatus,
		refetchOnWindowFocus: false,
		refetchInterval: enabled ? 2000 : false,
		enabled,
	});
};

export { useHAProvisionStatus };
