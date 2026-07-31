import React from "react";
import ReactDOM from "react-dom/client";
import App from "src/App.tsx";

import "@tabler/core/dist/css/tabler.min.css";
import "@tabler/core/dist/js/tabler.min.js";
// Nach Tabler, damit die Tokens des neuen Designs gewinnen. Tabler bleibt nur so
// lange eingebunden, wie es noch nicht migrierte Seiten gibt.
import "./styles/tokens.css";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
