import { createContext, useContext, useEffect, useMemo, useState } from "react";

interface ShellSearchValue {
	/** Live value of the header search box. */
	query: string;
	setQuery: (value: string) => void;
	/** Debounced value — this is what pages should filter on. */
	debouncedQuery: string;
}

const ShellSearchContext = createContext<ShellSearchValue>({
	query: "",
	setQuery: () => undefined,
	debouncedQuery: "",
});

/**
 * The header owns the search box but the pages do the filtering, so the value
 * has to live above both. Debouncing happens here rather than in each page —
 * otherwise every consumer would re-implement it, and they would drift.
 */
export function ShellSearchProvider({ children }: { children: React.ReactNode }) {
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(query), 200);
		return () => clearTimeout(timer);
	}, [query]);

	const value = useMemo(() => ({ query, setQuery, debouncedQuery }), [query, debouncedQuery]);
	return <ShellSearchContext.Provider value={value}>{children}</ShellSearchContext.Provider>;
}

export const useShellSearch = () => useContext(ShellSearchContext);
