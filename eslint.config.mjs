import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    ignores: ["worker/**", ".next/**", "node_modules/**"],
  },
  {
    rules: {
      // eslint-plugin-react v7 (bundled in eslint-config-next 16) has a
      // compatibility issue with ESLint 10's flat config API in this rule.
      "react/display-name": "off",
    },
  },
];
