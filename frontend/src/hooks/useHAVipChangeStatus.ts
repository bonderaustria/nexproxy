import { useQuery } from "@tanstack/react-query";
import { getHAVipChangeStatus, type ProvisionJob } from "src/api/backend";

const useHAVipChangeStatus = (enabled: boolean) => {
	return useQuery<ProvisionJob, Error>({
		queryKey: ["ha-vip-change-status"],
		queryFn: getHAVipChangeStatus,
		refetchOnWindowFocus: false,
		refetchInterval: enabled ? 2000 : false,
		enabled,
	});
};

export { useHAVipChangeStatus };
