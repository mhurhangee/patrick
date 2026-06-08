import { createRoot } from "react-dom/client"
import { App } from "./App"

// No StrictMode: ProseMirror mounts to the DOM directly and the dev
// double-invoke can fight the editor. This is a throwaway spike.
createRoot(document.getElementById("root")!).render(<App />)
