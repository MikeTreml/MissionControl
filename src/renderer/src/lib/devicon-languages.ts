/**
 * Map MC library language strings to Devicon folder/slug names.
 * CDN: https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/{slug}/{slug}-original.svg
 * @see https://devicon.dev/
 */
const LANG_TO_DEVICON: Record<string, string> = {
  typescript: "typescript",
  ts: "typescript",
  javascript: "javascript",
  js: "javascript",
  python: "python",
  py: "python",
  java: "java",
  kotlin: "kotlin",
  go: "go",
  golang: "go",
  rust: "rust",
  ruby: "ruby",
  php: "php",
  csharp: "csharp",
  "c#": "csharp",
  dotnet: "dot-net",
  ".net": "dot-net",
  c: "c",
  cpp: "cplusplus",
  "c++": "cplusplus",
  swift: "swift",
  scala: "scala",
  html: "html5",
  css: "css3",
  sass: "sass",
  scss: "sass",
  react: "react",
  vue: "vuejs",
  vuejs: "vuejs",
  angular: "angularjs",
  svelte: "svelte",
  node: "nodejs",
  nodejs: "nodejs",
  bash: "bash",
  shell: "bash",
  powershell: "powershell",
  docker: "docker",
  kubernetes: "kubernetes",
  k8s: "kubernetes",
  terraform: "terraform",
  aws: "amazonwebservices",
  azure: "azure",
  gcp: "googlecloud",
  graphql: "graphql",
  markdown: "markdown",
  md: "markdown",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  toml: "toml",
  xml: "xml",
  hcl: "terraform",
  nginx: "nginx",
  sql: "mysql",
  mysql: "mysql",
  postgres: "postgresql",
  postgresql: "postgresql",
  mongodb: "mongodb",
  redis: "redis",
  elasticsearch: "elasticsearch",
  git: "git",
  github: "github",
  gitlab: "gitlab",
  jenkins: "jenkins",
  linux: "linux",
  ubuntu: "ubuntu",
  windows: "windows8",
  vim: "vim",
  vscode: "vscode",
  figma: "figma",
  flutter: "flutter",
  dart: "dart",
  r: "r",
  matlab: "matlab",
  lua: "lua",
  perl: "perl",
  clojure: "clojure",
  haskell: "haskell",
  elixir: "elixir",
  erlang: "erlang",
  solidity: "solidity",
};

export function languageToDeviconSlug(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!key) return null;
  if (LANG_TO_DEVICON[key]) return LANG_TO_DEVICON[key];
  const alnum = key.replace(/[^a-z0-9+#.]/g, "");
  if (LANG_TO_DEVICON[alnum]) return LANG_TO_DEVICON[alnum];
  return null;
}

export function deviconSvgUrl(slug: string, variant: "original" | "plain" = "original"): string {
  return `https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${slug}/${slug}-${variant}.svg`;
}
