import type React from "react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

const StorageKey = "tabler-theme";
export const Light = "light";
export const Dark = "dark";

// Define theme types
export type Theme = "light" | "dark";

interface ThemeContextType {
	theme: Theme;
	toggleTheme: () => void;
	setTheme: (theme: Theme) => void;
	getTheme: () => Theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
	children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
	/**
	 * Seit dem Redesign ist NexProxy eine reine Dunkelanwendung: der Handoff gibt
	 * ausschliesslich Dunkelwerte vor, und der Umschalter ist entfallen.
	 *
	 * Fest auf Dark statt auf localStorage oder prefers-color-scheme — sonst
	 * bekaeme jemand mit heller Systemeinstellung ein helles Tabler unter dem
	 * dunklen Rahmen, und ohne Umschalter gaebe es keinen Weg zurueck.
	 * Die Schnittstelle bleibt erhalten, damit vorhandene Aufrufer nicht brechen.
	 */
	const [theme, setThemeState] = useState<Theme>(Dark);

	useEffect(() => {
		document.body.dataset.theme = theme;
		document.body.classList.remove(theme === Light ? Dark : Light);
		document.body.classList.add(theme);
		localStorage.setItem(StorageKey, theme);
	}, [theme]);

	const toggleTheme = () => {
		setThemeState((prev) => (prev === Light ? Dark : Light));
	};

	const setTheme = (newTheme: Theme) => {
		setThemeState(newTheme);
	};

	const getTheme = () => {
		return theme;
	};

	document.documentElement.setAttribute("data-bs-theme", theme);
	return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, getTheme }}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextType {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
