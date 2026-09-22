# Curator de destaques da Home

Projeto administrativo independente que cria o catálogo de personagens da coleção
`home_highlights`. Ele não escolhe os cinco destaques ativos do dia.

O fluxo é: listar candidatos na Comic Vine, confirmar cada ID no endpoint
`character/4005-{id}`, rejeitar personagem sem imagem HTTPS, enviar somente contexto factual à
Groq e validar a microcopy com Structured Outputs e JSON Schema. A IA nunca recebe controle de
`entityId`, `destination`, `imageUrl`, `segments`, `active` ou do ID do documento.

## Requisitos e configuração

Use Node.js 22 LTS:

```powershell
npm install
Copy-Item .env.example .env
```

No `.env`, configure `COMIC_VINE_API_KEY`, `GROQ_API_KEY` e, opcionalmente,
`GROQ_MODEL` (padrão `openai/gpt-oss-20b`). Esse nome é o ID do modelo no catálogo da Groq:
a requisição usa a API, a chave e a conta da Groq, não uma chave da OpenAI. Para publicar, configure também
`GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT` e, se necessário,
`FIRESTORE_DATABASE_ID`. O JSON da conta de serviço deve ficar fora do repositório.

No GitHub Actions, não é necessário criar um arquivo: cadastre
`FIREBASE_SERVICE_ACCOUNT_JSON` com o JSON completo da Service Account. O código entrega esse
objeto diretamente ao Firebase Admin em memória. `FIREBASE_SERVICE_ACCOUNT` permanece aceito
somente como alias legado.

O cliente usa a origem já adotada pelo Android (`https://comicvine.gamespot.com/api/`) e um
`User-Agent` identificável. A escolha inicial varia deterministicamente por data; `--offset` permite
controle administrativo explícito. Respostas 429, 5xx e timeouts têm no máximo três tentativas na
Comic Vine. O SDK oficial da Groq usa duas retentativas e timeout de 30 segundos. O modelo padrão
aceita Structured Outputs com JSON Schema em modo estrito; você pode trocar o modelo por
`GROQ_MODEL`, desde que ele também suporte `strict: true`.

## Comandos

```powershell
npm test
npm run validate
npm run generate -- --count 20 --dry-run
npm run generate -- --count 20
npm run generate -- --count 20 --offset 100
npm run generate -- --count 20 --publish
```

- `--dry-run`: consulta Comic Vine e Groq, imprime os documentos validados e não grava arquivo
  nem Firestore;
- sem modo: gera apenas `generated/home-highlights.generated.json` para revisão;
- `--publish`: gera o JSON local e publica por upsert em `home_highlights`;
- `--dry-run` e `--publish` juntos são rejeitados;
- `--count` aceita somente inteiros de 1 a 100.

## Contrato e segurança do upsert

O documento tem ID estável `character-{entityId}`, `destination: "CHARACTER"`, `segments: []`,
`rotationEligible: true`, `order: 0` e `active: false` quando é novo. `entityId`, nome, imagem e URL
de origem vêm da resposta confirmada da Comic Vine; a IA escreve apenas `eyebrow`, `title`,
`description` e `actionLabel`. O título precisa continuar igual ao nome oficial recebido.

Em documento existente, o Curator atualiza conteúdo editorial e metadados de geração, mas omite
`active` e `lastActivatedDate` do write e preserva `order`. Assim, um personagem ativo não é
desativado durante uma nova curadoria. Metadados administrativos são ignorados pelo mapeamento
manual do Android.

As descrições aceitam 80 a 180 caracteres, limite compatível com o herói de duas linhas da Home.
Os testes usam clientes mockados; não chamam Comic Vine, Groq ou Firestore reais.

## Como criar a chave da Groq

1. Acesse `https://console.groq.com/keys` e entre ou crie uma conta.
2. Selecione ou crie um projeto na GroqCloud.
3. Clique em **Create API Key**, dê um nome à chave e copie o valor exibido.
4. Crie o arquivo `.env` a partir do `.env.example` e preencha somente a cópia local:

```env
GROQ_API_KEY=sua-chave-aqui
GROQ_MODEL=openai/gpt-oss-20b
```

Nunca coloque a chave diretamente no código ou no `.env.example`. O `.gitignore` já protege `.env`.

## GitHub Actions

O workflow manual `.github/workflows/generate-highlights.yml` gera um dry-run por padrão e só
publica quando a entrada `publish` é habilitada. Cadastre estes Secrets:

- `GROQ_API_KEY`;
- `COMIC_VINE_API_KEY`;
- `FIREBASE_SERVICE_ACCOUNT_JSON` para publicação.

As variáveis opcionais são `GROQ_MODEL`, `GOOGLE_CLOUD_PROJECT` e `FIRESTORE_DATABASE_ID`. O ID do
projeto é inferido do JSON quando a variável não existe. Os secrets são validados antes da geração
e o JSON administrativo não é escrito no checkout.
