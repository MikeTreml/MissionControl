# Metaswarm References and Attribution

## Primary Source

- **Repository**: [https://github.com/dsifry/metaswarm](https://github.com/dsifry/metaswarm)
- **Author**: David Sifry
- **Description**: Autonomous multi-agent orchestration framework for issue-to-PR lifecycle management

## Concepts Adapted

The following Metaswarm concepts have been adapted into babysitter process definitions:

### Agent Roles
- **Issue Orchestrator**: Master coordinator per issue -> `workflows\metaswarm-orchestrator.js`
- **Researcher Agent**: Codebase exploration -> `workflows\metaswarm-orchestrator.js` (Phase 1)
- **Architect Agent**: Implementation planning -> `workflows\metaswarm-orchestrator.js` (Phase 1)
- **Product Manager Agent**: Use case validation -> `workflows\metaswarm-design-review.js`
- **Designer Agent**: UX/API review -> `workflows\metaswarm-design-review.js`
- **Security Design Agent**: Threat modeling -> `workflows\metaswarm-design-review.js`
- **CTO Agent**: TDD readiness -> `workflows\metaswarm-design-review.js`
- **Coder Agent**: TDD implementation -> `workflows\metaswarm-execution-loop.js`
- **Code Review Agent**: Adversarial review -> `workflows\metaswarm-execution-loop.js`
- **Security Auditor**: Implementation security -> `workflows\metaswarm-orchestrator.js` (Phase 6)
- **PR Shepherd**: PR lifecycle -> `workflows\metaswarm-pr-shepherd.js`
- **Swarm Coordinator**: Multi-issue management -> `workflows\metaswarm-swarm-coordinator.js`

### Workflow Phases
- **Phase 1: Research & Planning** -> `workflows\metaswarm-orchestrator.js` research + plan tasks
- **Phase 1b: Plan Review Gate** -> `workflows\metaswarm-orchestrator.js` 3 adversarial reviewers
- **Phase 2: Pre-Flight Validation** -> `workflows\metaswarm-orchestrator.js` preflight task
- **Phase 3: Design Review Gate** -> `workflows\metaswarm-design-review.js` (6 parallel, unanimous)
- **Phase 4: Work Unit Decomposition** -> `workflows\metaswarm-orchestrator.js` plan decomposition
- **Phase 5: Orchestrated Execution** -> `workflows\metaswarm-execution-loop.js` (4-phase cycle)
- **Phase 6: Final Comprehensive Review** -> `workflows\metaswarm-orchestrator.js` final review task
- **Phase 7: PR Creation & Shepherd** -> `workflows\metaswarm-pr-shepherd.js`

### Core Principles
- **Trust Nothing, Verify Everything, Review Adversarially** - Quality enforcement philosophy
- **TDD Mandatory** - Test-driven development as non-negotiable requirement
- **Fresh Reviewer Rule** - Prevent anchoring bias via new reviewer instances
- **Blocking Quality Gates** - Gates are state transitions, not advisories
- **Human Checkpoints** - Planned pauses at critical boundaries
- **Knowledge Persistence** - Cross-session learning via JSONL knowledge base

### Key Commands (mapped to process steps)
- `/start-task` -> metaswarm-orchestrator full lifecycle
- `/review-design` -> metaswarm-design-review process
- `bd prime` -> metaswarm-knowledge-cycle (prime mode)
- `/self-reflect` -> metaswarm-knowledge-cycle (reflect mode)
- `/handle-pr-comments` -> metaswarm-pr-shepherd comment handling
- `/pr-shepherd` -> metaswarm-pr-shepherd process
- `gtg` -> metaswarm-pr-shepherd merge readiness check

### Escalation Protocol
- Max 3 retry attempts per quality gate -> human escalation
- Max 3 design review iterations -> human escalation
- Stuck agents detected by health monitor -> human escalation
- Priority disputes in swarm coordination -> human escalation

## Acknowledgment

This adaptation brings Metaswarm's autonomous multi-agent orchestration patterns into the babysitter process framework. All credit for the original concepts, terminology, workflow design, and agent coordination philosophy belongs to David Sifry and the Metaswarm project contributors.



