import { useQuery } from "@tanstack/react-query";
import { getHADbConfig, type HADbConfig } from "src/api/backend";

const useHADbConfig = (options = {}) => {
	return useQuery<HADbConfig, Error>({
		queryKey: ["ha-db-config"],
		queryFn: getHADbConfig,
		refetchOnWindowFocus: false,
		...options,
	});
};

export { useHADbConfig };
