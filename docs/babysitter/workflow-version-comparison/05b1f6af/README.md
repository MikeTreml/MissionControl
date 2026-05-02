# Workflow Version Comparison - 05b1f6af

These files are copied from the upstream Babysitter repository for manual comparison.

- `known-good-parent.js`: upstream parent of `05b1f6af86b1062d5072c8099edad68f9fe526be`, used as the proof-backed restore source.
- `feedback-loop-commit.js`: upstream commit `05b1f6af86b1062d5072c8099edad68f9fe526be`, the generated feedback-loop version.

No Mission Control runtime code reads this folder; it is reference material only.

| Workflow | Mission Control path | Upstream source path | Parent syntax | Commit syntax |
| --- | --- | --- | --- | --- |
| role-swap-reasoning | `library/science/scientific-discovery/workflows/role-swap-reasoning.js` | `library/specializations/domains/science/scientific-discovery/role-swap-reasoning.js` | OK | FAIL: SyntaxError: Unexpected token 'export' |
| feature-store | `library/specializations/data-science-ml/workflows/feature-store.js` | `library/specializations/data-science-ml/feature-store.js` | OK | FAIL: SyntaxError: Unexpected token '}' |
| model-retraining | `library/specializations/data-science-ml/workflows/model-retraining.js` | `library/specializations/data-science-ml/model-retraining.js` | OK | OK |
| cloud-chaos-monkey | `library/specializations/devops-sre-platform/workflows/cloud-chaos-monkey.js` | `library/specializations/devops-sre-platform/cloud-chaos-monkey.js` | OK | FAIL: SyntaxError: Unexpected identifier 'lastFeedback_reviewApproval' |
| continuous-testing | `library/specializations/qa-testing-automation/workflows/continuous-testing.js` | `library/specializations/qa-testing-automation/continuous-testing.js` | OK | FAIL: SyntaxError: Unexpected token '}' |
| api-doc-generation | `library/specializations/technical-documentation/workflows/api-doc-generation.js` | `library/specializations/technical-documentation/api-doc-generation.js` | OK | FAIL: SyntaxError: Unexpected token '}' |
| docs-as-code-pipeline | `library/specializations/technical-documentation/workflows/docs-as-code-pipeline.js` | `library/specializations/technical-documentation/docs-as-code-pipeline.js` | OK | FAIL: SyntaxError: Unexpected token '}' |
