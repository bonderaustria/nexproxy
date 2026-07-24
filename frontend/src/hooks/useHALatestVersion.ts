import { useQuery } from "@tanstack/react-query";
import { getHALatestVersion } from "src/api/backend";

const useHALatestVersion = () => {
	return useQuery<{ latest: string | null }, Error>({
		queryKey: ["ha-latest-version"],
		queryFn: getHALatestVersion,
		refetchOnWindowFocus: false,
		refetchInterval: 60 * 1000,
		staleTime: 30 * 1000,
	});
};

export { useHALatestVersion };
