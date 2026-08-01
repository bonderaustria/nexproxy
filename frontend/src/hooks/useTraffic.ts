import { useQuery } from "@tanstack/react-query";
import { getTraffic, type TrafficResponse } from "src/api/backend/getTraffic";

/**
 * Live request rate and connection counts, refreshed once a second.
 *
 * The delta is computed on the server, so polling only fetches the current
 * figure — a tab that has just been opened shows the same value and the same
 * curve as one that has been open for an hour.
 */
export const useTraffic = () =>
	useQuery<TrafficResponse, Error>({
		queryKey: ["traffic"],
		queryFn: getTraffic,
		refetchInterval: 1000,
		refetchIntervalInBackground: false,
		staleTime: 0,
	});
