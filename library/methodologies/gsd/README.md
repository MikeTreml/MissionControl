# GSD-Adapted Workflows for Babysitter SDK

This directory contains workflows adapted from the [Get Shit Done](https://github.com/glittercowboy/get-shit-done) methodology for the Babysitter SDK orchestration framework.

## Overview

These processes implement the GSD philosophy of systematic planning, research, execution, and verification while using the Babysitter SDK's task orchestration capabilities.

## Core Workflows

### 1. New Project Initialization (`workflows\new-project.js`)
- Systematic vision capture through agent-guided questions
- Parallel domain research (stack, features, architecture, pitfalls)
- Requirements scoping (v1/v2 separation)
- Roadmap creation with phased milestones

### 2. Phase Discussion (`workflows\discuss-phase.js`)
- Captures implementation preferences before planning
- Identifies decision points (layouts, API patterns, structure)
- Creates context document for guided research

### 3. Phase Planning (`workflows\plan-phase.js`)
- Agent-based research informed by discussion context
- Creates atomic task plans with verification
- Plan checker validates against requirements
- Iterative refinement until plans pass quality gates

### 4. Phase Execution (`workflows\execute-phase.js`)
- Parallel task execution with fresh agent contexts
- Atomic git commits per task
- Progress tracking and dependency management
- Automated verification gates

### 5. Work Verification (`workflows\verify-work.js`)
- User acceptance testing gates
- Automated issue diagnosis
- Fix plan generation
- Re-verification loop

### 6. Milestone Audit (`workflows\audit-milestone.js`)
- Comprehensive milestone review
- Definition-of-done verification
- Quality assessment
- Readiness determination

## Advanced Workflows

### 7. Codebase Mapping (`workflows\map-codebase.js`)
- Brownfield project analysis
- Architecture understanding
- Pattern identification
- Integration planning

### 8. Iterative Convergence (`workflows\iterative-convergence.js`)
- Quality-gated development loop
- TDD with agent scoring
- Refinement cycles until target quality reached
- Parallel quality checks

## Utilities

### 9. State Management (`state-manager.js`)
- Cross-session memory
- Decision tracking
- Blocker management
- Progress persistence

### 10. Research Orchestrator (`research.js`)
- Parallel domain investigation
- Stack analysis
- Best practice discovery
- Pitfall identification

## Usage

Each workflow is a self-contained process module that can be:

1. **Run directly:**
```bash
babysitter run:create \
  --process-id gsd/new-project \
  --entry workflows\new-project.js#process \
  --inputs inputs.json
```

2. **Composed into larger workflows:**
```javascript
import { process as discussPhase } from './workflows\discuss-phase.js';
import { process as planPhase } from './workflows\plan-phase.js';

export async function process(inputs, ctx) {
  const discussion = await ctx.task(discussPhase, inputs);
  const plan = await ctx.task(planPhase, { ...inputs, discussion });
  // ...
}
```

3. **Customized for specific needs:**
Extend or modify any workflow to match your project requirements.

## Key Principles

### Context Engineering
- Always load relevant project context (PROJECT.md, REQUIREMENTS.md, STATE.md)
- Keep agent contexts fresh with targeted information
- Use artifacts directory for persistent state

### Quality Gates
- Verification loops at planning stage
- Automated checks during execution
- User acceptance gates at phase completion

### Atomic Execution
- Each task produces discrete, verifiable output
- Git commits per task for bisect-ability
- Clear success/failure criteria

### Iterative Refinement
- Agent-based quality scoring
- Feedback loops until target quality reached
- Progress tracking across iterations

## File Organization

```
gsd/
â”œâ”€â”€ README.md                    # This file
â”œâ”€â”€ workflows\new-project.js              # Project initialization
â”œâ”€â”€ workflows\discuss-phase.js            # Phase discussion
â”œâ”€â”€ workflows\plan-phase.js               # Phase planning with verification
â”œâ”€â”€ workflows\execute-phase.js            # Parallel execution with commits
â”œâ”€â”€ workflows\verify-work.js              # UAT and automated diagnosis
â”œâ”€â”€ workflows\audit-milestone.js          # Milestone completion check
â”œâ”€â”€ workflows\map-codebase.js             # Brownfield analysis
â”œâ”€â”€ workflows\iterative-convergence.js    # Quality convergence loop
â”œâ”€â”€ state-manager.js            # State persistence utilities
â”œâ”€â”€ research.js                 # Research orchestration
â””â”€â”€ examples/                   # Example input files
    â”œâ”€â”€ examples\new-project-example.json
    â”œâ”€â”€ examples\phase-example.json
    â””â”€â”€ examples\milestone-example.json
```

## Integration with Babysitter SDK

These workflows leverage:
- **Agent tasks** for LLM-based reasoning and decision making
- **Breakpoints** for human approval gates
- **Parallel execution** via `ctx.parallel.all()`
- **Task composition** for modular workflow building
- **State persistence** via artifacts and journal
- **Quality scoring** through agent-based assessment

## Differences from Original GSD

1. **SDK Native**: Uses Babysitter SDK primitives instead of custom orchestration
2. **Language**: JavaScript/Node.js instead of prompt-based skills
3. **Execution Model**: Task-based orchestration instead of CLI commands
4. **State Management**: Journal and artifacts instead of markdown files
5. **Composability**: Modular processes can be imported and composed

## Getting Started

1. Install the Babysitter SDK:
```bash
npm i -g @a5c-ai/babysitter-sdk@latest
```

2. Initialize a new project:
```bash
babysitter run:create \
  --process-id gsd/new-project \
  --entry workflows\new-project.js#process \
  --inputs '{"projectName": "My App"}'
```

3. Follow the workflow through discussion â†’ planning â†’ execution â†’ verification

## Contributing

When adding new workflows:
- Follow the GSD methodology of research â†’ plan â†’ verify
- Use agent tasks for reasoning, node/shell tasks for execution
- Include breakpoints at key decision points
- Document expected inputs and outputs
- Provide example input files



