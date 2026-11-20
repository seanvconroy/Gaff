# ADR-0017: One AI provider, with a usage log, a budget and switches

- Status: Proposed (brought across from the live line's ADR-0025, 8 November 2026). Amends ADR-0009.
- Date: 2026-11-19

## Context

ADR-0009 put Claude on Amazon Bedrock with EU routing, for drafting answers to renters' questions. The redesign added two more uses: reading a pasted advert into a letting (UX-LT-2) and reading an operator's question about who has enquired (UX-LP-15). Each had its own port and its own Bedrock client, the only choices were the stand-in or Bedrock, and nothing recorded what a call cost. So nobody had seen the real model at work on the test copy, and nothing would stop a bill growing.

The live line (the deployed test copy) had already settled this in its ADR-0025 and the providers PRD (P1 to P9). The founders decided there, on 8 November 2026 (its Q37), that the AI runs on the Claude API on the test copy and in development, with their credits and made-up data only, and on Claude on Bedrock in Dublin in production. The Claude API offers only global or US processing and stores data in the US, so it never sees a real renter's data.

## Decision

**Provider per environment.** `AI_PROVIDER` is `fake` (the stand-in, for tests and local work), `anthropic` (the Claude API, with `ANTHROPIC_API_KEY`) or `bedrock` (Claude on Bedrock in `eu-west-1`, in-region, invocation logging off). Production refuses `fake`, `anthropic` and the key.

**One port, one adapter.** `AiProvider` (`src/ports/ai.ts`) has one method per task. The Claude API client and the Bedrock client expose the same Messages API, so each task is written once (`src/adapters/ai/claude.ts`, prompts in `src/adapters/ai/prompts/`) and given either client. Claude Opus 5.5 (`AI_MODEL`) for every task, thinking adaptively, with the effort set per task. The model has no tools, every input is quoted data, and the reply must fit the task's schema (structured outputs). A refusal, a reply cut short or one that doesn't fit is no output. There is no server-side fallback to another model: a person is the fallback.

**Three tasks,** each with a prompt version, its own checks in the domain and a golden set:

| Task | What it does | With no output |
| --- | --- | --- |
| `answers` | Answers a renter's questions from the letting's facts, citing them (R8) | The questions go to the operator |
| `advert` | Reads a pasted advert into a letting, each value with its words (UX-LT-2) | "Fill it in myself" |
| `people` | Reads an operator's question about who has enquired into a filter (UX-LP-15) | The fixed decline |

Drafting a description, the unfair-wording check and reading documents (the live line's P10 to P14 and P30 on) are not built here. Each becomes a task in `src/domain/ai/tasks.ts` when it is.

**Every call through `runAi`** (`src/server/ai/usage.ts`). It:
- honours `AI_TASKS_OFF` (P8), a list of tasks or `all`;
- keeps to the month's budget, `AI_MONTHLY_BUDGET_USD` (P4): at 80%, one email a month to Gaff's own team (`STAFF_EMAILS`); at 100%, every task falls back until the next calendar month (UTC) or a raised budget. The stand-in costs nothing and never counts;
- logs every call in `ai_calls` (P3): task, provider, model, prompt version, tokens, estimated cost, time and outcome. Never the text sent or received, and nothing about any person. The organisation is kept only for the cost per operator. Only `withSystem()` reads or deletes rows; the nightly job deletes them after 12 months (rule 9);
- turns every failure (refused, invalid, timeout, error, over budget, switched off) into an outcome the feature already falls back on.

**Evals (P6).** `pnpm evals` runs a task's golden set against the configured model, after printing an estimate, and only with `--confirm`. The results are saved with the change. They never run in CI; the graders' own tests do, with no model.

## Consequences

- One setting picks the model for all three tasks, and one log shows what each costs.
- The test copy can run the real model on made-up data, within a budget the founders set.
- Rule 10's list of approved vendors should name the Claude API for the test copy and development only, with made-up data, beside Claude on Bedrock (EU) for production.
- An AWS account with Bedrock access to Claude Opus 5.5 in `eu-west-1` is still needed before launch.
- The `ai_calls` table names an organisation but holds no tenant data, so it carries a platform policy, not the tenant one; the tenant-isolation test names it as such.

## Alternatives considered

- **Keep three ports.** Each would need its own log, budget check and switch, and the model setting three times over.
- **The Claude API everywhere.** US processing for renters' messages, and a reversal of ADR-0009.
- **Bedrock everywhere now.** EU from the start, but nobody could try the real model before the AWS account exists, and the credits go unused.
- **A server-side model fallback on refusal.** It reruns a refused request on another model, which the evals don't cover. A person is the fallback instead.
