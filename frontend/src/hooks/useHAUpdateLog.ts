import { useQuery } from "@tanstack/react-query";
import { getHAUpdateLog } from "src/api/backend";

const useHAUpdateLog = (nodeName: string | null, enabled: boolean) => {
	return useQuery<{ log: string }, Error>({
		queryKey: ["ha-update-log", nodeName],
		queryFn: () => getHAUpdateLog(nodeName as string),
		refetchOnWindowFocus: false,
		refetchInterval: enabled && nodeName ? 2000 : false,
		enabled: enabled && !!nodeName,
	});
};

export { useHAUpdateLog };
