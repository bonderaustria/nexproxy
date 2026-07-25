import { useQuery } from "@tanstack/react-query";
import { getNpmImportStatus, type NpmImportJob } from "src/api/backend";

const useNpmImportStatus = (enabled: boolean) => {
	return useQuery<NpmImportJob, Error>({
		queryKey: ["npm-import-status"],
		queryFn: getNpmImportStatus,
		refetchOnWindowFocus: false,
		refetchInterval: enabled ? 1500 : false,
		enabled,
	});
};

export { useNpmImportStatus };
