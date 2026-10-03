import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    // Server Components: se renderizan una vez por request, usar la hora actual es correcto
    files: ["app/**/page.tsx", "app/**/layout.tsx", "components/DashboardView.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
];

export default config;
