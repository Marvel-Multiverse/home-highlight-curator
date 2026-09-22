import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ComicVineClient } from "./comic-vine.mjs";
import { generateHighlights } from "./curator.mjs";
import { publishHighlights } from "./firestore.mjs";
import { HighlightCopywriter } from "./groq-copy.mjs";

const projectDirectory = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function nextValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requer um valor.`);
  return value;
}

export function parseArguments(argv) {
  const options = {
    count: 20,
    offset: null,
    dryRun: false,
    publish: false,
    output: "generated/home-highlights.generated.json",
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--publish") options.publish = true;
    else if (argument === "--count") options.count = Number(nextValue(argv, index++, argument));
    else if (argument === "--offset") options.offset = Number(nextValue(argv, index++, argument));
    else if (argument === "--output") options.output = nextValue(argv, index++, argument);
    else if (argument === "--help") options.help = true;
    else throw new Error(`Argumento desconhecido: ${argument}`);
  }
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 100) {
    throw new Error("--count deve ser um inteiro entre 1 e 100.");
  }
  if (options.offset !== null && (!Number.isInteger(options.offset) || options.offset < 0)) {
    throw new Error("--offset deve ser um inteiro não negativo.");
  }
  if (options.dryRun && options.publish) throw new Error("Use --dry-run ou --publish, nunca os dois simultaneamente.");
  if (!options.output.trim()) throw new Error("--output requer um caminho não vazio.");
  return options;
}

function printHelp() {
  console.log([
    "Uso: npm run generate -- [--count 20] [--offset 0] [--dry-run|--publish]",
    "Sem modo, gera somente um JSON local. --dry-run não grava arquivo nem Firestore.",
    "Somente --publish grava por upsert na coleção home_highlights."
  ].join("\n"));
}

function printHighlight(highlight) {
  console.log([
    `\nDocumento: ${highlight.id}`,
    `Personagem: ${highlight.sourceName}`,
    `Comic Vine ID: ${highlight.entityId}`,
    `Imagem: ${highlight.imageUrl}`,
    `Eyebrow: ${highlight.eyebrow}`,
    `Título: ${highlight.title}`,
    `Descrição: ${highlight.description}`,
    `Ação: ${highlight.actionLabel}`,
    `Segmentos: ${highlight.segments.length ? highlight.segments.join(", ") : "[] (universal)"}`
  ].join("\n"));
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArguments(argv);
  if (options.help) return printHelp();
  const model = env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
  const comicVine = new ComicVineClient(env.COMIC_VINE_API_KEY);
  const copywriter = new HighlightCopywriter(env.GROQ_API_KEY, model);
  const generatedAt = new Date().toISOString();
  const seed = generatedAt.slice(0, 10);

  console.log("✓ Comic Vine configurada");
  console.log(`✓ Groq configurada (modelo: ${model})`);
  console.log(`Gerando ${options.count} destaque(s)...`);
  const result = await generateHighlights({
    count: options.count,
    offset: options.offset,
    seed,
    model,
    generatedAt,
    comicVine,
    copywriter
  });
  result.highlights.forEach(printHighlight);

  if (options.dryRun) {
    console.log("\nDRY RUN — NO FIRESTORE WRITES");
    console.log(`Validados: ${result.highlights.length}; rejeitados durante a busca: ${result.rejected}.`);
    return result;
  }

  const outputPath = path.resolve(projectDirectory, options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result.highlights, null, 2)}\n`, "utf8");
  console.log(`\nArquivo local gerado: ${outputPath}`);

  if (!options.publish) {
    console.log("Nenhuma publicação realizada. Use --publish explicitamente após revisar o JSON.");
    return result;
  }

  const report = await publishHighlights(result.highlights, { env });
  console.log(`Created: ${report.created}`);
  console.log(`Updated: ${report.updated}`);
  console.log(`Preserved: ${report.preserved}`);
  console.log(`Rejected: ${result.rejected + report.rejected}`);
  return { ...result, report };
}
