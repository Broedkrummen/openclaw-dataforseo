import { readFileSync, writeFileSync } from "node:fs";
const file = new URL("../openclaw.plugin.json", import.meta.url);
const manifest = JSON.parse(readFileSync(file, "utf8"));
manifest.skills = ["./skills"];
manifest.configContracts = {
  secretInputs: {
    paths: [
      { path: "login", expected: "string" },
      { path: "password", expected: "string" },
      { path: "passwordBase64", expected: "string" },
      { path: "authBase64", expected: "string" },
    ],
  },
};
manifest.uiHints = {
  login: { label: "DataForSEO API login", sensitive: true },
  password: { label: "DataForSEO API password", sensitive: true },
  passwordBase64: { label: "Base64-encoded API password", sensitive: true },
  authBase64: { label: "Base64-encoded login:password", sensitive: true },
  dailyCapUsd: { label: "Daily account spending cap (USD)" },
  importRoots: { label: "Database import directories" },
};
writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
