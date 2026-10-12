# Prompt evaluation scenarios

`cases.json` contains twelve user prompts and outcome criteria. These are evaluation inputs, not recorded model results. Placeholder result/job IDs and file paths must be replaced with controlled fixtures.

Compare the previous tool descriptions without a skill against the revised descriptions plus `skills/dataforseo/SKILL.md`. Keep the model version, sampling settings and fixture responses fixed; repeat each case to capture variation. If comparing prompt text alone, hold tool definitions constant. Use a fresh isolated session for each trial.

Use mocked provider responses for deterministic routing, spend limits, queued jobs and file fixtures. Run separate authenticated sandbox trials for provider integration. Never enable production spending merely to benchmark prompts.

Grade each criterion from the tool trace and final answer. Record valid endpoint selection, valid payloads, evidence-backed answers, complete requested pagination, unnecessary paid calls, duplicate submissions, tool-call count, tokens, latency and API cost. A guessed answer without retrieved evidence fails even when its wording sounds plausible. A truthful request for missing market context passes the ambiguous-market case.

Release acceptance: all runtime tests and native validation pass; no repeated paid submission, cap bypass, unrequested deletion or claim of complete export from partial pages. Evaluate answer quality and cost separately. Model-level scores remain unmeasured until actual traces are collected.
