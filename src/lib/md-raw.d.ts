// Markdown imported as a raw string, e.g. the New Document dialog's sample
// paper. Declared here — where both tsconfig projects include this directory —
// because vite/client's generic `*?raw` wildcard only loads in the app project.
declare module '*.md?raw' {
  const content: string
  export default content
}
