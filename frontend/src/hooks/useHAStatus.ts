import { useQuery } from "@tanstack/react-query";
import { getHAStatus, type HAStatusResponse } from "src/api/backend";

const fetchHAStatus = () => getHAStatus();

const useHAStatus = (options = {}) => {
	return useQuery<HAStatusResponse, Error>({
		queryKey: ["ha-status"],
		queryFn: fetchHAStatus,
		refetchOnWindowFocus: false,
		retry: 2,
		refetchInterval: 10 * 1000, // 10 seconds
		staleTime: 8 * 1000,
		...options,
	});
};

export { fetchHAStatus, useHAStatus };
