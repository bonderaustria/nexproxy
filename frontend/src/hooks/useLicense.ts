import { useQuery } from "@tanstack/react-query";
import { getLicense, type LicenseInfo } from "src/api/backend";

const useLicense = (options = {}) => {
	return useQuery<LicenseInfo, Error>({
		queryKey: ["license"],
		queryFn: getLicense,
		refetchOnWindowFocus: false,
		staleTime: 60 * 1000,
		...options,
	});
};

export { useLicense };
