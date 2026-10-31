# ADR-0009: AI drafts answers only, from letting facts, processed in the EU

- Status: Accepted (CTO decision, 31 October 2026). Confirm EU model availability and the DPA before launch.
- Date: 2026-10-31

## Context

One wrong fact or unfair sort damages the operator's reputation. The PRD's guardrails: facts only from the letting, never decides, blind to protected grounds, says it's an AI, enquiry text is untrusted, fixed wording where it matters, every message logged, approve-before-send. The PRD names Claude via the API. Renters' messages are personal data, so they must be processed in the EU.

## Decision

**What the AI does in Slice 1:** it drafts answers to renters' questions (R8). Nothing else. First replies, invitations, confirmations, reminders and holding messages use fixed templates; later, so do offers, outcomes and checks. Templates are filled with names and dates by code, not by the AI.

**How a draft is made:**

1. Code strips the renter's name, email address and phone number from the text.
2. The model receives the letting's facts (each with an ID), the fixed lawful answers (for example, on HAP), and the renter's question as quoted data.
3. It returns structured output: for each question, either an answer with the fact IDs it relied on, or "needs the operator".
4. Code rejects any answer that cites no valid fact. It checks the wording for protected-ground content, then queues the answer for approval, or sends it if approve-before-send is off. Everything else becomes an operator question.
5. The operator's answer becomes a new fact, after the same protected-ground check, so Gaff can reuse it.

**Untrusted input:** the model has no tools, its output is validated against a schema, and nothing in it is executed. The worst an instruction hidden in an enquiry can do is cause a wrong draft, which the fact-ID check, the protected-ground check and approval mode catch.

**Logging:** every draft records its model, prompt version, cited facts, check results and whether a person approved or edited it.

**Provider:** Claude through **Amazon Bedrock with EU geographic routing**, which keeps prompts and outputs within EU regions. Anthropic's own API currently offers only global or US-only processing. **Alternative:** Google Vertex AI in an EU region. Either way the AI sits behind an `AiDrafter` port: tests use a deterministic fake, and a separate eval suite runs against the real model.

**Model:** Claude Opus 5.5 (`claude-opus-5-5`; on Bedrock, `anthropic.claude-opus-5-5`), once we've confirmed it's offered in the EU profile. Rough cost: 2 to 3 cents per drafted answer at Anthropic's list prices, so a few euro per letting even with hundreds of enquiries. Bedrock's prices may differ. Moving to a cheaper model (Sonnet 5.5 or Haiku 5.5) is your call once the evals show the quality holds.

## Consequences

- AI risk is confined to one message kind, behind several checks.
- The eval suite (golden questions, injection attempts, protected-ground questions, questions outside the facts) runs before every prompt or model change.
- Needs an AWS account with Bedrock access in an EU region. Check that prompt logging is off, and check the DPA.

## Alternatives considered

- **AI writes all messages.** More flexible, but it breaks the PRD's fixed-wording rule.
- **Anthropic's API directly.** The simplest integration, but there's no EU-only processing option today.
