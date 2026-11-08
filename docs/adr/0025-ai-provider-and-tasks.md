# ADR-0025: Where the AI runs, and the tasks it does

- Status: Proposed (with the [providers PRD](../providers/prd.md), 8 November 2026, revised the same day). Amends ADR-0009.
- Date: 2026-11-08

## Context

ADR-0009 put Claude on Amazon Bedrock with EU routing, and limited the AI to drafting answers to renters' questions. The test copy has used a deterministic stand-in ever since, so nobody has seen the real model answer. The founders have Claude API credits, but the Claude API offers only global or US inference, and stores data at rest in the US. Claude in Amazon Bedrock serves Claude Opus 5.5 in `eu-west-1` (Dublin) as an in-region endpoint. The marketplace adds two jobs the AI can do well: drafting a listing's description from its facts (M45), and catching unfair wording the word list misses (ADR-0023).

## Decision

**Provider per environment (Q37).** The test copy and development use the Claude API, with the founders' credits, on made-up data and the founders' own test messages. Production uses Claude in Amazon Bedrock in `eu-west-1`, in-region, with invocation logging off. Production refuses any other provider. Real renters' data never reaches the Claude API.

**One implementation.** The Claude API client (`Anthropic`) and the Bedrock client (`AnthropicBedrockMantle`) expose the same Messages API, so each task is written once and given either client. The model is Claude Opus 5.5 for every task, with the effort set per task; moving a task to a cheaper model is the founders' call once its evals pass.

**Four tasks (Q41):**

1. Answers to renters' questions (R8), unchanged from ADR-0009.
2. Drafting a listing description from the facts the letter entered (M45). It's checked like the letter's own words and published only by the letter.
3. Checking listings, and operators' reusable answers, for wording that excludes people on a protected ground (ADR-0023). It only adds holds for a person at Gaff.
4. Reading renters' work and income documents (ADR-0026): the kind of document, the name on it, its date, and the employer and pay, or the amount of other income. It returns fields, never prose, and never a PPS number.

Holding letters' messages that ask for money before a viewing (M28) waits for a later phase.

**Safety.** Every input is quoted data, and the model has no tools. Output is schema-checked, then checked by code against the product rules. A refusal, timeout or invalid output falls back to people, not to another model. Every call is logged with its task, model, prompt version, tokens and estimated cost, never its text. A monthly budget pauses the AI and falls back to people when it's spent. Each task has a golden set, run against the real model before any prompt or model change.

## Consequences

- The AI's scope widens from one message kind to four tasks, each behind its own checks and evals.
- Documents reach the model with names on them, because they can't be redacted first. That's acceptable only in the EU, which is why production must be Bedrock in Dublin.
- An AWS account with Bedrock access to Claude Opus 5.5 in `eu-west-1` is needed before launch.
- The test copy's costs come out of the founders' credits, capped by the budget.

## Alternatives considered

- **The Claude API everywhere.** Simplest, but it means US processing for renters' messages and documents, a new vendor under rule 10, and reversing ADR-0009.
- **Bedrock everywhere now.** EU from day one, but it needs the AWS account before anyone can try the real model, and the credits go unused.
- **Server-side model fallback on refusal.** It re-runs a refused request on another model, which our evals wouldn't cover, and Bedrock doesn't offer it. A person is the fallback instead.
