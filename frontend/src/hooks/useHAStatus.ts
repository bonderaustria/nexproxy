import { useQuery } from "@tanstack/react-query";
import { getHAStatus, type HAStatusResponse } from "src/api/backend";

const fetchHAStatus = () => getHAStatus();

const useHAStatus = (options = {}) => {
	return useQuery<HAStatusResponse, Error>({
		queryKey: ["ha-status"],
		queryFn: fetchHAStatus,
		refetchOnWindowFocus: false,
		refetchIntervalInBackground: true,
		retry: 2,
		refetchInterval: 5 * 1000, // 5 seconds — keeps VIP/role/status visibly live
		staleTime: 3 * 1000,
		...options,
	});
};

export { fetchHAStatus, useHAStatus };
