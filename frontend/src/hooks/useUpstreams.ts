import { useQuery } from "@tanstack/react-query";
import { getUpstreams, type Upstream } from "src/api/backend";

const useUpstreams = () => {
	return useQuery<Upstream[], Error>({
		queryKey: ["upstreams"],
		queryFn: getUpstreams,
		refetchOnWindowFocus: false,
		refetchInterval: 15 * 1000,
	});
};

export { useUpstreams };
