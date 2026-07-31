import { useQuery } from "@tanstack/react-query";
import { getSystemHealth, type SystemHealthResponse } from "src/api/backend/getSystemHealth";

/**
 * CPU / memory / disk for the dashboard. Polled every 30 seconds — often enough
 * to be useful, rare enough that an idle dashboard tab costs nothing.
 */
export const useSystemHealth = () =>
	useQuery<SystemHealthResponse, Error>({
		queryKey: ["system-health"],
		queryFn: getSystemHealth,
		refetchInterval: 30 * 1000,
		staleTime: 15 * 1000,
	});
