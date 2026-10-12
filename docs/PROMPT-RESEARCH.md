# Agent instruction design

Researched 12 October 2026. The resulting prompt is [the bundled DataForSEO skill](../skills/dataforseo/SKILL.md); parameter guidance is also embedded in the native tools.

OpenClaw supports plugin-owned skills through manifest paths, with a small discovery description and an instruction body that the agent reads when applicable. We use that mechanism to keep detailed workflow guidance available without placing the entire endpoint catalogue in every turn. The skill is eligible when its plugin is enabled; credentials remain runtime configuration, so catalogue and saved-result work can proceed without them. [OpenClaw skills](https://docs.openclaw.ai/skills)

OpenAI recommends clear function and parameter semantics, a small initial tool set, and moving predictable sequences into code. Its guidance also cautions that examples can harm some reasoning models. We retain seven tools, automate collection, distinguish provider IDs from saved IDs in parameter descriptions, and put a few syntax examples in an optional reference. [Function calling](https://developers.openai.com/api/docs/guides/function-calling)

Anthropic emphasizes descriptions that make purpose, inputs, outputs and expected use clear, alongside realistic task evaluation. We made summaries explicitly different from datasets and added rules for reading evidence before drawing conclusions, recovering uncertain submissions, and reporting partial completion. [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)

A 2026 empirical preprint finds that fuller descriptions can improve completion while increasing execution steps and sometimes reducing success. Compact variants can preserve useful behavior. This supports selective detail rather than maximizing prompt length; it does not establish a benefit for this plugin or every OpenClaw model. [Hasan et al., revised May 2026](https://arxiv.org/abs/2602.14878v3)

Our design inference is to keep endpoint knowledge in the catalogue, runtime guarantees in code, critical input formats in tool schemas, and task strategy in an on-demand skill. The prompt prioritizes relevant saved data, current routes, correct market and time window, complete JSON, narrow retrieval, and resumable jobs. It avoids redundant spending checks and exhaustive data collection for every request.

## Validation limits

Runtime tests exercise the documented workflows with controlled responses. Evaluation scenarios in `eval/` cover common routing, retrieval and recovery mistakes. They support comparing models and prompt variants; passing runtime tests is not evidence that an LLM follows the prompt more reliably. No measured improvement in task success, token use or latency is claimed without model-level traces.

For a real comparison, keep the model version, tools, fixtures and sampling settings fixed. Run baseline and revised instructions across the same scenarios with repeated trials. Record endpoint selection, valid arguments, evidence-backed completion, reposts, unnecessary calls, tokens, latency and paid API cost. Review regressions before adopting a variant, and keep hard guarantees in code.
