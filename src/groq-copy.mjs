import Groq from "groq-sdk";
import { assertGeneratedCopy, copySchema } from "./schema.mjs";

export class HighlightCopywriter {
  constructor(apiKey, model, { client = null } = {}) {
    if (!client && !apiKey) throw new Error("GROQ_API_KEY não configurada. Configure no .env antes de executar.");
    if (!model?.trim()) throw new Error("GROQ_MODEL não pode ser vazio.");
    this.client = client || new Groq({ apiKey, maxRetries: 2, timeout: 30_000 });
    this.model = model;
  }

  async write(character) {
    const source = {
      name: character.name,
      realName: character.realName,
      summary: character.summary,
      aliases: character.aliases,
      publisher: character.publisher,
      origin: character.origin,
      issueAppearances: character.issueAppearances
    };
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: [
            "Você redige microcopy editorial em português do Brasil para a Home de um app de quadrinhos.",
            "Use somente fatos presentes nos dados fornecidos; não invente histórias, poderes, identidades, relações ou eventos.",
            "Se os dados forem escassos, escreva uma apresentação genérica, editorial e correta.",
            "O campo title deve ser exatamente igual ao campo name da fonte, sem traduzir ou alterar.",
            "Escreva eyebrow em maiúsculas, description entre 80 e 180 caracteres e actionLabel objetiva."
          ].join(" ")
        },
        { role: "user", content: JSON.stringify(source) }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "home_highlight_copy",
          strict: true,
          schema: copySchema
        }
      }
    });
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error(`A Groq não retornou texto estruturado para ${character.name}.`);
    let copy;
    try {
      copy = JSON.parse(content);
    } catch {
      throw new Error(`A Groq retornou JSON inválido para ${character.name}.`);
    }
    return assertGeneratedCopy(copy);
  }
}
