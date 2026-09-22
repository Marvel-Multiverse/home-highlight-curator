import { main } from "./src/cli.mjs";

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
